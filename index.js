const core = require('@actions/core');

const msRestNodeAuth = require("@azure/ms-rest-nodeauth");
const { ConsumptionManagementClient } = require("@azure/arm-consumption");
const { BillingManagementClient } = require("@azure/arm-billing");

const JSONtoMarkDown = require('json-to-markdown-table');

const generateReportForPeriod = async (consumptionClient, period, tags = []) => {
  let totalCosts = 0;
  let result = null;
  let nextLink = null; 
  let aggregatedResult = []

  while (true) {
    if (!nextLink) {
      result = await consumptionClient.usageDetails.listByBillingPeriod(period);
    } else {
      result = await consumptionClient.usageDetails.listByBillingPeriodNext(nextLink);
    }

    aggregatedResult = result
    .reduce((pr, curr) => {
      const existingResult = pr.findIndex((item) => item.instanceName === curr.instanceName)
      
      if (existingResult < 0) {
        const length = pr.push({
          instanceName: curr.instanceName,
          costs: curr.pretaxCost,
          instanceLocation: curr.instanceLocation,
          service: curr.consumedService
        })
        
        if (tags) {
          tags.forEach(tag => pr[length - 1][tag] = curr.tags && curr.tags.owner || "")
        }
      } else {
        pr[existingResult].costs = pr[existingResult].costs + curr.pretaxCost;
      }

      totalCosts += curr.pretaxCost;
      return pr
    }, aggregatedResult)
    
    if (!result.nextLink) {
      break;
    } 

    nextLink = result.nextLink;
  }

  return {
    totalNumberOfResources: aggregatedResult.length,
    totalCosts: totalCosts,
    resources: aggregatedResult,
    period
  }
}

const postToIssue = async (currentPeriod, previousPeriod) => {
  const costDifference = (currentPeriod.totalCosts - previousPeriod.totalCosts) / previousPeriod.totalCosts * 100;
  
  const intro = `
Total Azure costs in period ${currentPeriod.period}: ${currentPeriod.totalCosts} (${Math.round(costDifference)}% compared to last period). \n
Total Azure costs in period ${previousPeriod.period}: ${previousPeriod.totalCosts}. \n
Total Azure resources in period ${currentPeriod.period}: ${currentPeriod.totalNumberOfResources}. \n
Total Azure Resources in period ${previousPeriod.period}: ${previousPeriod.totalNumberOfResources}. \n
`

  const resourcesMarkdownTable = JSONtoMarkDown(currentPeriod.resources, Object.keys(currentPeriod.resources[0]));

  console.log(intro)
  console.log(resourcesMarkdownTable);
}

const getInput = (name) => {
  return core.getInput(name) || process.env[name]
}

const run = async () => {
  const subscriptionId = getInput("subscriptionId");
  const directoryId = getInput("directoryId");
  const clientId = getInput("clientId");
  const clientSecret = getInput("clientSecret")

  const credentials = await msRestNodeAuth.loginWithServicePrincipalSecret(clientId, clientSecret, directoryId);
  const consumptionClient = new ConsumptionManagementClient(credentials, subscriptionId);
  const billingClient = new BillingManagementClient(credentials, subscriptionId);

  const periods = await billingClient.billingPeriods.list({ top: 5 });
  const finishedPeriods = periods.filter(({ invoiceIds = [] }) => invoiceIds.length);

  const reportThisMonth = await generateReportForPeriod(consumptionClient, finishedPeriods[0].name, ["owner"]);
  const reportPreviousMonth = await generateReportForPeriod(consumptionClient, finishedPeriods[1].name);

  postToIssue(reportThisMonth, reportPreviousMonth)
}

run();
