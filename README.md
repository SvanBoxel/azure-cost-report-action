# Azure Cost Report

This GitHub Action allows you to publish all consumed Azure resources and associated costs for the last billing period of an Azure subscription. By default it posts the results to a GitHub issue the action is running in, but it also allows you to use the output in a subsequent action.

This GitHub Actions works on a per-subscription basis. This means that if you want to use this functionality for all subscriptions within an Azure account, you need to run it multiple times.

## Configuration
To run this GitHub Action you need to create an Enterprise application in Azure and give it permission to access your subscription info:

1. Search for 'App Registration' in the Azure portal.
2. Click 'New Registration'.
    - Name it so you can easily identify it later on.
    - Check "Accounts in this organizational directory only (salesgithub (Default Directory) only - Single tenant)".
    - No Redirect URI needed. 
3. Note the Application (client) ID and Directory (tenant) ID.
4. Click 'Certificates and Secrets' in the left-hand menu.
    - Click the 'New client secret' button and give it a name a expiry setting.
    - Note the client secret (and make sure to delete this note when you're done setting everything up).
5. Search for 'Subscriptions' in the Azure portal.
6. Click the subscription you like to scan.
    - Note the subscription ID
7. Click 'Access control' in the left-hand menu
8. Add a new role assignment
    - Select 'Reader' role.
    - Select for the name of the Enterprise application you created in step 2.
    - Save.
9. Save the secret from step 4 in the GitHub secret manager within the repository you want to run this action in. `(https://github.com/<owner>/<repository>/settings/secrets)`.
10. Copy-paste one of the examples below to get started.

## Examples
Run this action on every release and publish results to issue:
```
on: [release]

jobs:
  azure-cost-analyser:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout
      uses: actions/checkout@v2.0.0
    - name: Azure-cost
      uses: ./
      with:
        subscriptionId: <Azure subscription id> # Per step 6
        directoryId: <Azure directory id> # Per step 3
        clientId: <Azure client id> # Per step 3
        clientSecret: ${{ secrets.azure_client_secret }} # Per step 10
        github_token: ${{ secrets.GITHUB_TOKEN }}
```

Run this action on every release, but skip posting results to issue. (Result are available as [output](https://help.github.com/en/actions/building-actions/metadata-syntax-for-github-actions#outputs))

```
on: [release]

jobs:
  azure-cost-analyser:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout
      uses: actions/checkout@v2.0.0
    - name: Azure-cost
      uses: ./
      with:
        subscriptionId: <Azure subscription id> # Per step 6
        directoryId: <Azure directory id> # Per step 3
        clientId: <Azure client id> # Per step 3
        clientSecret: ${{ secrets.azure_client_secret }} # Per step 10
        disableIssue: true
```

Run this action every month and include "team" and "owner" tag

```
on:
  schedule:
    - cron:  '0 0 1 * *'
jobs:
  azure-cost-analyser:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout
      uses: actions/checkout@v2.0.0
    - name: Azure-cost
      uses: ./
      with:
        subscriptionId: <Azure subscription id> # Per step 6
        directoryId: <Azure directory id> # Per step 3
        clientId: <Azure client id> # Per step 3
        clientSecret: ${{ secrets.azure_client_secret }} # Per step 10
        github_token: ${{ secrets.GITHUB_TOKEN }}
        includeTags: "team,owner"
```

## Output
Next to publishing the results in a markdown table to a GitHub issue, a JSON output is also available for further consumption.

Output format:
```
{ totalNumberOfResources: 123,
  totalCosts: '1234.12',
  currency: 'USD',
  period: 202003
  resources:
   [ { instanceName: '112bf220-8243-485c-abaf-187252d34178-eus',
       costs: '123.12 USD',
       instanceLocation: 'US East',
       service: 'microsoft.operationalinsights',
      },
     { instanceName: 'main-sec-linux',
       costs: '312.95 USD',
       instanceLocation: 'US East 2',
       service: 'Microsoft.Compute',
      },
       ```
   ]
}
```

## Local testing
Run the following command from the command line to test this action locally.

```
subscriptionId="<subscription id>" directoryId="<directory id>" clientId="<client id>" clientSecret="<client secret>" node src/index.js
```