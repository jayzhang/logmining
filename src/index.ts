import tokenizelib from "@stdlib/nlp-tokenize";
import * as lcs from "lcs-diff";
import isNumber from "is-number";
import * as check from "@techmmunity/easy-check";
import crypto from "crypto";
import XLSX from "xlsx";



function tokenize(input: string): Token[] {
  const array = tokenizelib(input);
  const tokens = array.map(t=> {
    const type = checkType(t);
    return {text: t, type: type} as Token;
  });
  return tokens;
}

enum TokenType {
  raw = "[raw]",
  number = "[number]",
  email = "[email]",
  ip = "[ip]",
  url = "[url]",
  path = "[path]",
  uuid = "[uuid]",
  wildcard = "[*]",
}

interface Token {
  text?: string,
  type: TokenType,
}

function checkType(word: string) : TokenType {
  if(check.isEmail(word)){
    return TokenType.email;
  }
  if(check.isIpv4(word) || check.isIpv4WithMask(word)){
    return TokenType.ip;
  }
  if(isNumber(word)) {
    return TokenType.number;
  }
  if(check.isUrl(word)){
    return TokenType.url;
  }
  if(word === '_PATH_'){
    return TokenType.path;
  }
  if(check.isUUIDv4(word) || check.isHerokuApiKey(word)){
    return TokenType.uuid;
  }
  return TokenType.raw;
}

function merge(lcs: lcs.LCS<Token>): Token[]{
  const results:Token[] = [];
  for(const cmp of lcs.getDiff()) {
    const token = cmp.equals ? cmp.unitA! : {text: undefined, type: TokenType.wildcard};
    results.push(token);
  }
  return results;
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

function compare(list1: Token[], list2: Token[]) {
  let results = new lcs.LCS({
    content : {
        listA : list1,
        listB : list2,
    },
    compare : (t1,t2)=>{
      if(t1.text === t2.text || (t1.type !== TokenType.raw && t2.type !== TokenType.raw && t1.type === t2.type) ) return true;
      return false;
    }
  });
  return results;
}

function toString(tokens: Token[]) {
  const patternStr = tokens.map(i=>{
    if(i.type === TokenType.raw) return i.text;
    else return `<b>${i.type}</b>`;
  }).join(" ");
  return patternStr;
}
 
interface Cluster {
  representIndex: number;
  memberIndexes: number[];
  representRaw?: any;
  represent?: Token[];
  mergeSims?:number[];
  pattern? : Token[];
}



function logmine(logs: any[], minSimilarity = 0.6) {
  logs = logs.filter(l=>l.errorMsg).map(l=>{
    delete l.Properties;
    return l;
  });
  //1. merge logs with identical content
  const hashMap = new Map<string, Cluster>();
  logs.reduce((map, log: any, index: number, array: any[])=>{
    const msg = log.errorMsg as string;
    const hash = crypto.createHash('md5').update(msg.trim()).digest('hex');
    let c:Cluster|undefined = hashMap.get(hash);
    if(c === undefined) {
      c = { representIndex: index, memberIndexes: [index] , representRaw: log, mergeSims:[]};
      hashMap.set(hash, c);
    }
    else {
      c.memberIndexes.push(index);
    }
  });

  // 2. clustering
  let clusters = Array.from(hashMap.values());
  let minSim = 1;
  clusters = clusteringOnce(clusters, minSimilarity);

  // 3. print
  // const html = reportHtml(clusters, logs);
  // console.log(html);

  const json = reportJson(clusters, logs);
  console.log(JSON.stringify(json));

  // addClusterFields(clusters, logs);
  // console.log(JSON.stringify(logs));
}

function clusteringOnce(inputs: Cluster[], minsim: number) : Cluster[] {
  if(inputs.length === 1) {
    return inputs;
  }
  for(const input of inputs) {
     const log = input.representRaw;
     if(log) {
        input.represent = tokenize(log.errorMsg);
     }
  }
  const clusters: Cluster[] = [{...inputs[0]}];
  for(let i = 1; i < inputs.length; ++ i) {
    const input = inputs[i];
    if(input.represent) {
      let found = false;
      for(const cluster of clusters) {
        if(cluster.represent) {
          const results = compare(input.represent,  cluster.represent);
          const sim = results.getSimilarity();
          if(sim >= minsim) {
            for(const index of input.memberIndexes) {
              cluster.memberIndexes.push(index);
            }
            cluster.mergeSims?.push(sim);
            // update pattern
            if(!cluster.pattern){
              cluster.pattern = merge(results);
            }
            else { 
              const patternRes = compare(input.represent,  cluster.pattern);
              cluster.pattern = merge(patternRes);
            }
            found = true;
            break;
          }
        }
      }
      if(!found) {
        const newCluster:Cluster = {...input};
        clusters.push(newCluster);
      }
    }
  }
  return clusters;
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

interface ClusterView {
  count: number,
  percent: number, 
  pattern: string,
  events: string,
  errorCodes: string,
  versions: string,
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



const workbook = XLSX.readFile(process.argv[2]);
const sheet_name_list = workbook.SheetNames;
const xlData = XLSX.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]]);
logmine(xlData);