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
  raw: any;
}


export enum TokenType {
  raw = "",
  witespace = "_T_SPACE_",
  number = "_T_NUMBER_",
  email = "_T_EMAIL_",
  ip = "_T_IP_",
  url = "_T_URL_",
  path = "_T_PATH_",
  uuid = "_T_UUID_",
  wildcard = "_T_ANY_"
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

export function tokenize(input: string): Token[] {
  const array = tokenizelib(input, true);
  const tokens = array.map(t=> {
    if(isWhitespace(t)){
      return {text: t, type: TokenType.witespace}
    }
    const type = checkType(t);
    return {text: t, type: type} as Token;
  });
  return tokens;
}

function checkType(word: string) : TokenType {
  if(word === TokenType.email || check.isEmail(word)){
    return TokenType.email;
  }
  if(word === TokenType.ip || check.isIpv4(word) || check.isIpv4WithMask(word)){
    return TokenType.ip;
  }
  if(word === TokenType.number || isNumber(word)) {
    return TokenType.number;
  }
  if(word === TokenType.url || check.isUrl(word)){
    return TokenType.url;
  }
  if(word === TokenType.path || word === '_PATH_'){
    return TokenType.path;
  }
  if(word === TokenType.uuid || check.isUUIDv4(word) || check.isHerokuApiKey(word)){
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

export function toString(tokens: Token[]) {
  const array = tokens.map(t => {
    if(t.type === TokenType.witespace) return " ";
    if(t.type === TokenType.raw) return t.text;
    return t.type;
  });
  return array.join("");
}

export function isWhitespace(character: string) {
  return /^\s+$/.test(character)
}