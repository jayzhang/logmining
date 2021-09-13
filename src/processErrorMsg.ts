import XLSX from "xlsx";
import { Cluster, clustering, ILog, Token, TokenType } from ".";
import crypto from "crypto";
import path from "path";
import fs from "fs-extra";

interface ClusterView {
  count: number,
  percent: number, 
  pattern: string,
  events: string,
  errorCodes: string,
  versions: string,
}

function cleanPattern(tokens: Token[]) {
  const results: Token[] = [];
  let preIsWC = false;
  for(const t of tokens) {
    if(t.type === TokenType.wildcard && preIsWC) {
      continue;
    }
    results.push(t);
    if(t.type === TokenType.wildcard) {
      preIsWC = true;
    }
    else {
      preIsWC = false;
    }
  }
  return results;
}
 
function toString(tokens: Token[]) {
  const patternStr = tokens.map(i=>{
    if(i.type === TokenType.raw) return i.text;
    else return `<b>${i.type}</b>`;
  }).join(" ");
  return patternStr;
}
  



 
function reportHtml(clusters: Cluster[], logs: any[]): string{
  let html = `<h>#total:${logs.length},#patterns:${clusters.length}</h>`;
  clusters = clusters.sort((a,b)=>{return b.memberIndexes.length - a.memberIndexes.length});
  for( const c of clusters) {
    const pattern = c.pattern ? c.pattern : c.represent;
    const cleaned = cleanPattern(pattern!);
    let str = toString(cleaned!);
    const pct = (c.memberIndexes.length*100/logs.length).toFixed(3);
    const set = new Set<string>();
    let detail = c.memberIndexes.map(i=>{
      const log = logs[i];
      set.add(log['event']);
      return `\t\t<details><summary>${log.errorMsg}</summary><pre><code>${JSON.stringify(logs[i], undefined, 4)}</code></pre></details>`;
    }).join('\n');

    html += `<details>\n\t<summary>\n Frequent: ${c.memberIndexes.length}, Percentage: ${pct}%, Events: ${JSON.stringify(Array.from(set))}, Pattern: ${str}\t</summary>\n<ul>${detail}</ul></details>\n`;
  }
  return html;
}
 
function reportJson(clusters: Cluster[], logs: any[]): ClusterView[] {
  const cvs: ClusterView[] = [];
  clusters = clusters.sort((a,b)=>{return b.memberIndexes.length - a.memberIndexes.length});
  for( const c of clusters) {
    const pattern = c.pattern ? c.pattern : c.represent;
    const cleaned = cleanPattern(pattern!);
    let str = toString(cleaned!);
    const pct = Number((c.memberIndexes.length*100/logs.length).toFixed(3));
    const events: any = {};
    const errorCodes: any = {};
    const versions: any = {};
    let detail = c.memberIndexes.map(i=>{
      const log = logs[i];
      const event = log.event;
      const errorCode = log.errorCode;
      const version = log.version;
      if(events[event]) {
        events[event] ++;
      }
      else {
        events[event] = 1;
      }
      if(errorCodes[errorCode]) {
        errorCodes[errorCode] ++;
      }
      else {
        errorCodes[errorCode] = 1;
      }
      if(versions[version]) {
        versions[version] ++;
      }
      else {
        versions[version] = 1;
      }
    });
    const view:ClusterView = {
      count:c.memberIndexes.length,
      pattern: str,
      percent: pct,
      events: JSON.stringify(events),
      errorCodes: JSON.stringify(errorCodes),
      versions: JSON.stringify(versions),
    };
    cvs.push(view);
  }
  return cvs;
}



function addClusterFields(clusters: Cluster[], logs: any[]) {
  for( const c of clusters) {
    const pattern = c.pattern ? c.pattern : c.represent;
    const cleaned = cleanPattern(pattern!);
    const str = toString(cleaned!);
    const clusterId = crypto.createHash('md5').update(str.trim()).digest('hex');
    for(let index of c.memberIndexes) {
      logs[index].clusterId = clusterId;
      logs[index].pattern = pattern;
      logs[index].occurNumber = c.memberIndexes.length;
    }
  }
}

const inputPath = path.resolve(process.argv[2]);

const workbook = XLSX.readFile(inputPath);
const sheet_name_list = workbook.SheetNames;
const xData = XLSX.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]]);

let logs: ILog[] = xData.map((l: any)=>{
  delete l.Properties;
  const log:ILog = {
    content: l.errorMsg,
    ... l
  };
  return log;
});

const clusters = clustering(logs);

const outputFolder = path.resolve(process.argv[3]);

const html = reportHtml(clusters, logs);

fs.writeFileSync(path.join(outputFolder, "clusters.html"), html);

const json = reportJson(clusters, logs);

fs.writeJsonSync(path.join(outputFolder, "clusters.json"), json);