# logmining
This is an simplified implementation of the paper [LogMine: Fast Pattern
Recognition for Log Analytics](https://www.cs.unm.edu/~mueen/Papers/LogMine.pdf).
The idea is to use a distance function to calculate a distance between to log
line and group them into clusters.

# basic usage

```
npm install logmining
```

```
import { Cluster, clustering, ILog, Token, TokenType } from "logmining";

const logs:Ilog[] = ...

const clusters = clustering(logs);

//view clusters

```

# Usage for Error clustering analysis for TeamsFx Errors

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

The clustering results have two files in the same folder of input excel file: one html file and one json file:

![image](https://user-images.githubusercontent.com/1658418/133027355-b4083fdf-e307-4c49-9ea3-8128be165059.png)

The html file is a list of clusters (order by the size of cluster):

![image](https://user-images.githubusercontent.com/1658418/133027470-a48d27ee-5e2e-4522-a85e-fdb49f658e58.png)

The json file is the json data of clusters, including some basic statistics of clusters:

![image](https://user-images.githubusercontent.com/1658418/133027169-13452844-fa4a-42e3-89de-92ab8d7ff72c.png)

