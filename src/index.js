const core = require("@actions/core");
const github = require("@actions/github");

const msRestNodeAuth = require("@azure/ms-rest-nodeauth");
const { ConsumptionManagementClient } = require("@azure/arm-consumption");
const { BillingManagementClient } = require("@azure/arm-billing");

const JSONtoMarkDown = require("json-to-markdown-table");

const generateReportForPeriod = async (consumptionClient, period, tags = []) => {
  let totalCosts = 0;
  let result = null;
  let nextLink = null;
  let aggregatedResult = [];
  let currency;

  while (true) {
    if (!nextLink) {
      result = await consumptionClient.usageDetails.listByBillingPeriod(period);
      currency = result[0].currency;
    } else {
      result = await consumptionClient.usageDetails.listByBillingPeriodNext(nextLink);
    }

    aggregatedResult = result.reduce((pr, curr) => {
      const existingResult = pr.findIndex(item => item.instanceName === curr.instanceName);

      if (existingResult < 0) {
        const length = pr.push({
          instanceName: curr.instanceName,
          costs: curr.pretaxCost,
          instanceLocation: curr.instanceLocation,
          service: curr.consumedService
        });

        if (tags.length) {
          tags.forEach(tag => (pr[length - 1][tag] = (curr.tags && curr.tags.owner) || ""));
        }
      } else {
        pr[existingResult].costs = pr[existingResult].costs + curr.pretaxCost;
      }

      totalCosts += curr.pretaxCost;
      return pr;
    }, aggregatedResult);

    if (!result.nextLink) {
      break;
    }

    nextLink = result.nextLink;
  }

  resources = aggregatedResult
    .sort((a, b) => b.costs - a.costs)
    .map(resource => ({
      ...resource,
      costs: `${parseFloat(resource.costs).toFixed(2)} ${currency}`
    }));

  return {
    totalNumberOfResources: aggregatedResult.length,
    totalCosts: parseFloat(totalCosts).toFixed(2),
    resources,
    period,
    currency
  };
};

const postToIssue = async (currentPeriod, previousPeriod) => {
  const github_token = getInput("githubToken");

  if (!github_token) {
    core.setFailed("Cannot create issue because GITHUB_TOKEN is missing.");
  }

  const octokit = new github.GitHub(github_token);
  const costDifference = ((currentPeriod.totalCosts - previousPeriod.totalCosts) / previousPeriod.totalCosts) * 100;
  const costsThisMonth = `${currentPeriod.totalCosts} ${currentPeriod.currency}`;
  const costsPreviousMonth = `${previousPeriod.totalCosts} ${previousPeriod.currency}`;

  const intro = `
Total Azure costs in period ${currentPeriod.period}: **${costsThisMonth}** (${Math.round(costDifference)}% compared to last period).  
Total Azure costs in period ${previousPeriod.period}: **${costsPreviousMonth}**.  
Total Azure resources in period ${currentPeriod.period}: **${currentPeriod.totalNumberOfResources}**.   
Total Azure Resources in period ${previousPeriod.period}: **${previousPeriod.totalNumberOfResources}**.  
`;

  const resourcesMarkdownTable = JSONtoMarkDown(currentPeriod.resources, Object.keys(currentPeriod.resources[0]));
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

  const { data: issue_response } = await octokit.issues.create({
    owner,
    repo,
    title: `Azure cost report for ${currentPeriod.period}`,
    body: `${intro} ${resourcesMarkdownTable}`
  });

  await octokit.issues.update({
    owner,
    repo,
    issue_number: issue_response.number,
    state: "closed"
  });
};

const getInput = name => {
  return core.getInput(name) || process.env[name];
};

const run = async () => {
  const subscriptionId = getInput("subscriptionId");
  const directoryId = getInput("directoryId");
  const clientId = getInput("clientId");
  const clientSecret = getInput("clientSecret");
  const disableIssue = getInput("disableIssue");
  const includeTags = getInput("includeTags") || "";

  const credentials = await msRestNodeAuth.loginWithServicePrincipalSecret(clientId, clientSecret, directoryId);
  const consumptionClient = new ConsumptionManagementClient(credentials, subscriptionId);
  const billingClient = new BillingManagementClient(credentials, subscriptionId);

  const periods = await billingClient.billingPeriods.list({ top: 5 });
  const finishedPeriods = periods.filter(({ invoiceIds = [] }) => invoiceIds.length);

  const reportThisMonth = await generateReportForPeriod(
    consumptionClient,
    finishedPeriods[0].name,
    includeTags.split(",")
  );
  const reportPreviousMonth = await generateReportForPeriod(consumptionClient, finishedPeriods[1].name);

  core.setOutput("reportThisMonth", JSON.stringify(reportThisMonth));
  core.setOutput("reportPreviousMonth", JSON.stringify(reportPreviousMonth));

  if (disableIssue) {
    return;
  }

  postToIssue(reportThisMonth, reportPreviousMonth);
};

run();
