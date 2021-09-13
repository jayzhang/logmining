import tokenizelib from "@stdlib/nlp-tokenize";
import * as lcs from "lcs-diff";
import isNumber from "is-number";
import * as check from "@techmmunity/easy-check";
import crypto from "crypto";


export interface Cluster {
  representIndex: number;
  memberIndexes: number[];
  representRaw?: ILog;
  represent?: Token[];
  pattern? : Token[];
}

export interface ILog {
  content: string;
}


export enum TokenType {
  raw = "[raw]",
  number = "[number]",
  email = "[email]",
  ip = "[ip]",
  url = "[url]",
  path = "[path]",
  uuid = "[uuid]",
  wildcard = "[*]",
}

export interface Token {
  text?: string,
  type: TokenType,
}


export function clustering(logs: ILog[], minSimilarity = 0.6): Cluster[] {
  //1. merge logs with identical content
  const hashMap = new Map<string, Cluster>();
  for(let index = 0 ; index < logs.length; ++ index){
    const log = logs[index];
    const hash = crypto.createHash('md5').update(log.content.trim()).digest('hex');
    let c = hashMap.get(hash);
    if(!c) {
      c = { representIndex: index, memberIndexes: [index] , representRaw: log};
      hashMap.set(hash, c);
    }
    else {
      c.memberIndexes.push(index);
    }
  } 

  // 2. clustering
  let clusters = Array.from(hashMap.values());
  clusters = clusteringOnce(clusters, minSimilarity);
  return clusters;
}

function tokenize(input: string): Token[] {
  const array = tokenizelib(input);
  const tokens = array.map(t=> {
    const type = checkType(t);
    return {text: t, type: type} as Token;
  });
  return tokens;
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



function clusteringOnce(inputs: Cluster[], minsim: number) : Cluster[] {
  if(inputs.length === 1) {
    return inputs;
  }
  for(const input of inputs) {
     const log = input.representRaw;
     if(log) {
        input.represent = tokenize(log.content);
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