const { chromium } = require('playwright');
const readline = require('readline');
const fs = require('fs');
const { answersDatabase, saveAnswer, handleNewQuestion, calculateSimilarity, getMostSimilarQuestion, normalizeAndTokenize } = require('./utils_Numeric.js');
const { answerDropDown, handleNewAnswerDropDown } = require('./utils_DropDown');
const { answerBinaryQuestions, handleNewQuestionBinary} = require('./utils_Binary.js');

async function answerNumericQuestions(page) {
  const questionElements = await page.$$('label.artdeco-text-input--label');
  for (let questionElement of questionElements) {
    const questionText = await questionElement.textContent();
    console.log("Question", questionText);
    const inputId = await questionElement.getAttribute('for');
    const answerElement = await page.$(`#${inputId}`);

    const result = getMostSimilarQuestion(questionText.trim());
    let mostSimilarQuestion = null;
    let maxSimilarity = 0;

    if (result) {
      mostSimilarQuestion = result.mostSimilarQuestion;
      maxSimilarity = result.maxSimilarity;
    }

    let answer = null;
    if (mostSimilarQuestion && maxSimilarity > 0.7) {
      answer = answersDatabase[mostSimilarQuestion];
    } else {
      answer = await handleNewQuestion(questionText.trim());
    }

    if (answerElement && answer !== null) {
      await answerElement.fill(answer);
    } else {
      console.log(`No answer found or no suitable question found for: "${questionText.trim()}".`);
    }
  }
}

async function answerQuestions(page){
  await  answerNumericQuestions(page)
  await  answerBinaryQuestions(page)
  await answerDropDown(page)
}

async function handleNextOrReview(page) {
  let hasNextButton = true;

  while (hasNextButton) {
    try {
      const nextButton = await page.$('button[aria-label="Continue to next step"]');
      if (nextButton) {
        await nextButton.click();
        await page.waitForTimeout(3000);
        await answerQuestions(page);
      } else {
        hasNextButton = false;
      }
    } catch (error) {
      hasNextButton = false;
    }
  }

  try {
    const reviewButton = await page.$('button[aria-label="Review your application"]');
    if (reviewButton) {
      await reviewButton.click();
      console.log("Review button successfully clicked");

      const submitButton = await page.$('button[aria-label="Submit application"]');
      if (submitButton) {
        await submitButton.click();
        console.log("Submit button clicked");

        await page.waitForTimeout(5000);
        await page.waitForSelector('button[aria-label="Dismiss"]', { visible: true });
        let modalButton = await page.$('button[aria-label="Dismiss"]');
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
          try {
            await modalButton.evaluate(b => b.click());
            console.log("Dismiss button clicked");
            break;
          } catch (error) {
            console.log(`Attempt ${attempts + 1} failed: ${error.message}`);
            attempts++;
            await page.waitForTimeout(500);
            modalButton = await page.$('button[aria-label="Dismiss"]');
          }
        }

        if (attempts === maxAttempts) {
          console.log("Failed to click the Dismiss button after multiple attempts.");
        }
      }
    }
  } catch (error) {
    console.log('Review button not found or failed to click:', error.message);
  }
}

async function fillPhoneNumber(page, phoneNumber) {
  try {
    let inputElement;

    try {
      let labelName = "Mobile phone number";
      inputElement = await page.getByLabel(labelName, { exact: true });
      await inputElement.fill(phoneNumber);
      console.log(`Filled ${labelName} with ${phoneNumber}`);
      return;
    } catch (error) {
      console.log("Mobile phone number input field not found, trying Phone label.");
    }

    try {
      let labelName = "Phone";
      inputElement = await page.getByLabel(labelName, { exact: true });
      await inputElement.fill(phoneNumber);
      console.log(`Filled ${labelName} with ${phoneNumber}`);
    } catch (error) {
      console.log("Phone input field not found.");
    }

  } catch (error) {
    console.error("Error filling phone number:", error);
  }
}

async function getJobName(page) {
  try {
    const jobNameElement = await page.$('//h1[contains(@class,"t-24 t-bold")]//a[1]');
    if (jobNameElement) {
      const jobName = await jobNameElement.textContent();
      return jobName.trim();
    } else {
      return "Unknown Job";
    }
  } catch (error) {
    console.error("Error extracting job name:", error);
    return "Unknown Job";
  }
}

(async () => {
  const browser = await chromium.launch({ headless: false });

  const context = await browser.newContext();
  const page = await context.newPage();

  try{
  await page.goto('https://www.linkedin.com/login');

  // Login
  await page.fill('input[name="session_key"]', 'aditya1234@gmail.com'); // replace your ID
  await page.fill('input[name="session_password"]', 'password'); //  replace the password
  await page.click('button[type="submit"]');

  await page.waitForSelector('a.global-nav__primary-link--active', { timeout: 0 });
  console.log('Login was Sucessfull');

  await page.goto('https://www.linkedin.com/jobs/');

  await page.waitForTimeout(3000)
  await page.getByRole('combobox', { name: 'Search by title, skill, or' }).click();
  await page.waitForTimeout(3000)

  await page.getByRole('combobox', { name: 'Search by title, skill, or' }).fill('Data Engineer');
  await page.getByRole('combobox', { name: 'Search by title, skill, or' }).press('Enter');
  await page.waitForTimeout(5000)

  await page.waitForSelector("//button[@aria-label='Easy Apply filter.']");
  await page.click("//button[@aria-label='Easy Apply filter.']");

  console.log("Filter applied successfully ")
  await page.waitForTimeout(3000);

  let currentPage = 1;
  let jobCounter = 0;

  while (true) {
    console.log(`Navigating to page ${currentPage}`);

  const jobListings = await page.$$('//div[contains(@class,"display-flex job-card-container")]');
  console.log(`Number of job listed on page ${currentPage}: ${jobListings.length}`);

  if (jobListings.length === 0) {
    console.log(`No jobs found on page ${currentPage}. Exiting.`);
    break;
  }

  for (let job of jobListings) {

    jobCounter++;
    console.log(`Processing job ${jobCounter} on page ${currentPage}`);
    await job.click();

    const alreadyApplied = await page.$('span.artdeco-inline-feedback__message:has-text("Applied")');
    if (alreadyApplied) {
      const jobName = await getJobName(page);
      console.log(`Already applied to the job: ${jobName}. Skipping.`);
      continue;
    }

    let easyApplyButton

    try{
      easyApplyButton = await page.waitForSelector('button.jobs-apply-button', { timeout: 5000 });
      await easyApplyButton.click();
    }catch(error){
      console.log('No Easy Apply button found or failed to click. Skipping this job.');
      continue;
    }

    await page.waitForTimeout(3000)

    const emailLabel = await page.$('label:has-text("Email address")') || await page.$('label:has-text("Email")');
    if (emailLabel) {
      const emailInputId = await emailLabel.getAttribute('for');
      await page.selectOption(`#${emailInputId}`, 'wattsoneric1@gmail.com');
    }

    try {
      const phoneCountryLabel = await page.$('label:has-text("Phone country code")');
      if (phoneCountryLabel) {
        const phoneCountryInputId = await phoneCountryLabel.getAttribute('for');
        await page.selectOption(`#${phoneCountryInputId}`, 'India (+91)');
      }
    } catch (error) {
      console.log('Phone country code dropdown not found:', error.message);
    }

    await fillPhoneNumber(page, '1234567890');

    await page.waitForTimeout(3000)

    await answerQuestions(page);
    await handleNextOrReview(page)

  }
  currentPage++;
  const nextPageButton = await page.$(`button[aria-label="Page ${currentPage}"]`);
  if (nextPageButton) {
    await nextPageButton.click();
    await page.waitForTimeout(5000);
    console.log(`Navigated to page ${currentPage}`);
  } else {
    console.log(`No more pages found. Exiting.`);
    break;
  }
}
}catch (error) {
  console.error("Script error:", error);
} finally {
  await browser.close();
}
})();
