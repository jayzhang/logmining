# logmine
This is an simplified implementation of the paper [LogMine: Fast Pattern
Recognition for Log Analytics](https://www.cs.unm.edu/~mueen/Papers/LogMine.pdf).
The idea is to use a distance function to calculate a distance between to log
line and group them into clusters.

# Usage for Error clustering analysis

## Export data in Azure Data Explorer

Query kustro:

```
database('vscode-ext-aggregate').table('teamsfx_all')
| where ExtensionName == "ms-teams-vscode-extension"
| where ServerTimestamp >= datetime(2021-6-28)
| extend event = trim_start("ms-teams-vscode-extension/", EventName)
| extend component = tostring(Properties["component"])
| extend success = tostring(Properties["success"])
| extend appid = tostring(Properties["appid"])
| extend correlationId = tostring(Properties["correlation-id"])
| extend resources = tostring(Properties["resources"])
| extend errorType = tostring(Properties["error-type"])
| extend errorCode = tostring(Properties["error-code"])
| extend errorMsg = tostring(Properties["error-message"])
| project ServerTimestamp, version=ExtensionVersion, event, component, success, errorType, errorCode, errorMsg, machineId=VSCodeMachineId, correlationId
| where success == "no"
| where errorType == "system"
| where version matches regex "^2.6.0$" 
```

Export data in excel format:

![image](https://user-images.githubusercontent.com/1658418/133026679-876a1f96-3fc4-477d-89f8-9fcc828fc9bd.png)

## Cluster data in file
Run the clustering program on you exported excel data:
```
npm install
npm run build
node .\dist\processErrorMsg.js <error excel file path>
```

## View clustering results

The clustering results have two files: one html file and one json file.

The html file is a list of clusters:

[image](https://user-images.githubusercontent.com/1658418/133027092-aa157dfb-b7b7-4e53-b12e-f53c0ca04078.png)

The json file is the json data of clusters, including some basic statistics of clusters:

![image](https://user-images.githubusercontent.com/1658418/133027169-13452844-fa4a-42e3-89de-92ab8d7ff72c.png)

