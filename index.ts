import "dotenv/config";
import * as fs from "fs";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v3";

const TARGET_URL = "https://vibhorfoods.com";
const BRAND_NAME = "Flipkart, Flipkart Minutes, Cleartrip, OR Myntra";

async function main() {
  fs.mkdirSync("screenshots", { recursive: true });
  let stepCount = 0;

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    // model: "google/gemini-2.5-flash",
    // //The API key autoloads so from GOOGLE_GENERATIVE_AI_API_KEY set in the .env file.
    // browserbaseSessionCreateParams: {
    //   browserSettings: {
    //     blockAds: true,
    //     viewport: { width: 1288, height: 711 },
    //   },
    // },
  });

  await stagehand.init();

  console.log(`\nBrand Abuse Check Started`);
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Brand being checked: ${BRAND_NAME}`);
  console.log(
    `Watch live: https://browserbase.com/sessions/${stagehand.browserbaseSessionId}\n`
  );

  const page = stagehand.context.pages()[0];

  //Land on the page 
  await page.goto(TARGET_URL);
  await page.screenshot({ path: "screenshots/step-000-landing.png", fullPage: true });
  console.log(`Landing page screenshot saved.`);

  //Extract brand abuse signals 
  console.log(`\nExtracting brand abuse signals...`);

  const brandSignals = await stagehand.extract(
    `Analyze this page for brand abuse / phishing indicators against the brand "${BRAND_NAME}". Extract the following:
    - page title and any brand name shown
    - logo description (color, text, style)
    - color scheme used (primary colors)
    - any login or signup forms present
    - any use of the word "${BRAND_NAME}" or its variants
    - any copied UI elements that mimic ${BRAND_NAME}
    - the domain shown in any links or buttons
    - any trust signals (SSL badges, "official" text, etc.)
    - any suspicious elements (urgent messages, fake discounts, requests for credentials)`,
    z.object({
      pageTitle: z.string(),
      brandNameShown: z.string(),
      logoDescription: z.string(),
      colorScheme: z.string(),
      hasLoginForm: z.boolean(),
      hasSignupForm: z.boolean(),
      flipkartMentions: z.string(),
      copiedUIElements: z.string(),
      suspiciousLinks: z.string(),
      trustSignals: z.string(),
      suspiciousElements: z.string(),
    })
  );

  console.log(`\nBrand Signals Extracted:`);
  console.log(JSON.stringify(brandSignals, null, 2));

  //Agent browses the site and screenshots every step 
  console.log(`\nStarting agent browse with auto-screenshots...`);



  const agent = stagehand.agent({
    mode: "dom",
    model: "google/gemini-2.5-flash",
    systemPrompt: `You are a cybersecurity analyst performing a brand abuse / phishing investigation on the website ${TARGET_URL}.
    Your job is to:
    1. Browse the site thoroughly — check the homepage, navigation links, login/signup pages, product pages, and footer.
    2. Look for evidence that this site is impersonating ${BRAND_NAME}.
    3. Do NOT enter any real credentials — if you encounter login forms, note them but do not submit.
    4. Be methodical: check the header, footer, any modals, and at least 2–3 internal pages.`,
  });

  // Poll every 3 seconds to capture screenshots throughout agent execution
  let pollCount = 0;
  const screenshotPoller = setInterval(async () => {
    pollCount++;
    stepCount++;
    const filename = `screenshots/step-${String(stepCount).padStart(3, "0")}-poll-${pollCount}.png`;
    const activePage = stagehand.context.pages()[0];
    await activePage.screenshot({ path: filename, fullPage: true }).catch(() => { });
    console.log(`Screenshot saved: ${filename}`);
  }, 3000);

  const agentResult = await agent.execute({
    instruction: `Investigate ${TARGET_URL} for brand abuse of ${BRAND_NAME}. 
    Browse the homepage, click on navigation items, check for login/signup pages, 
    inspect the footer for contact info and legal notices, and check at least 2 product or category pages. 
    At the end, summarize your findings: Is this site impersonating ${BRAND_NAME}? What evidence did you find?`,
    maxSteps: 20,
    highlightCursor: true,
  });

  // Stop polling once agent is done
  clearInterval(screenshotPoller);

  // ── Step 4: Final report ──────────────────────────────────────────────────
  console.log(`\n\n${"=".repeat(60)}`);
  console.log(`BRAND ABUSE INVESTIGATION REPORT`);
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Brand: ${BRAND_NAME}`);
  console.log(`Screenshots saved: ${stepCount} (in ./screenshots/)`);
  console.log(`${"=".repeat(60)}`);
  console.log(`\nExtracted Signals:\n`, JSON.stringify(brandSignals, null, 2));
  console.log(`\nAgent Findings:\n`, agentResult.message);
  console.log(`${"=".repeat(60)}\n`);

  // Save report to file
  const report = {
    target: TARGET_URL,
    brand: BRAND_NAME,
    timestamp: new Date().toISOString(),
    screenshotCount: stepCount,
    extractedSignals: brandSignals,
    agentFindings: agentResult.message,
  };
  fs.writeFileSync("brand-abuse-report.json", JSON.stringify(report, null, 2));
  console.log(`Full report saved to brand-abuse-report.json`);

  await stagehand.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
