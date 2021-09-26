import tokenizelib from "@stdlib/nlp-tokenize";
import * as check from "@techmmunity/easy-check";
import crypto from "crypto";
import isNumber from "is-number";
import * as lcs from "lcs-diff";
import porterStemmer from "@stdlib/nlp-porter-stemmer";

export interface Cluster {
  representIndex: number;
  memberIndexes: number[];
  representRaw?: ILog;
  represent?: Token[];
  pattern? : Token[];
}

export interface ClusterView{
  pattern: Token[];
  patternString: string;
  patternId: string;
  count: number;
  memberIndexes: number[];
  data?:any;
}

export interface ILog {
  content: string;
  raw: any;
}


export enum TokenType {
  witespace = "SPACE",
  number = "NUM",
  email = "EMAIL",
  ip = "IP",
  url = "URL",
  path = "PATH",
  uuid = "UUID",
  wildcard = "ANY"
}

export interface Token {
  t?: string,
  c?: TokenType,
}


export function clustering(logs: ILog[], minSimilarity = 0.6): ClusterView[] {
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
  clusters = clusters.sort((a,b)=>(Math.random()-0.5));
  clusters = clusteringOnce(clusters, minSimilarity);
  
  // 3. convert
  const clusterViews = convertToView(clusters);

  return clusterViews;
}

function convertToView(clusters: Cluster[]) : ClusterView[] {
  const clusterViews:ClusterView[] = [];
  for(const cluster of clusters){
    const pattern = cluster.pattern ? cluster.pattern : cluster.represent;
    if(!pattern) {
      throw Error("pattern is undefined for cluster: " + JSON.stringify(cluster));
    }
    abstractPattern(pattern);
    const patternString = showPatternString(pattern);
    const serialized = JSON.stringify(pattern);
    const patternId = crypto.createHash('md5').update(serialized.trim()).digest('hex');
    const view: ClusterView = {
      pattern: pattern,
      memberIndexes: cluster.memberIndexes,
      patternString: patternString,
      patternId: patternId,
      count: cluster.memberIndexes.length
    }
    clusterViews.push(view);
  }

  return clusterViews;
}

export function clusteringIncr(logs: ILog[], clusters: ClusterView[], minSimilarity = 0.6) : ClusterView[]{
  for(let index = 0 ; index < logs.length; ++ index) {
    const log = logs[index];
    const logPattern = tokenize(log.content);
    let found = false;
    for(const cluster of clusters) {
      const clusterPattern = cluster.pattern;
      if(!clusterPattern) throw Error(`invalid cluster: ${JSON.stringify(cluster)}`);
      const results = compare(logPattern,  clusterPattern);
      const sim = results.getSimilarity();
      const content1 = log.content;
      const content2 = cluster.patternString;
      const isContain = content1 && content2 && logPattern.length > 1 && clusterPattern.length > 1 && (content1.startsWith(content2) || content2.startsWith(content1))
      if(sim >= minSimilarity || isContain) {
        cluster.memberIndexes.push(index);
        cluster.count ++;
        cluster.pattern = merge(results);
        found = true;
        break;
      }
    }
    if(!found) {
      abstractPattern(logPattern);
      const patternString = showPatternString(logPattern);
      const serialized = JSON.stringify(logPattern);
      const patternId = crypto.createHash('md5').update(serialized.trim()).digest('hex');
      const newCluster:ClusterView = {
        memberIndexes: [index],
        pattern: logPattern,
        patternId: patternId,
        patternString: patternString,
        count: 1
      };
      clusters.push(newCluster);
    }
  }
  return clusters;
}

export function tokenize(input: string): Token[] {
  const array = tokenizelib(input, true);
  const tokens = array.map(t=> {
    // if(isWhitespace(t)){
    //   return {t: t, c: TokenType.witespace}
    // }
    const type = checkType(t);
    return {t: t, c: type} as Token;
  });
  return tokens;
}

function checkType(word: string) : TokenType|undefined {
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
  return undefined;
}

function merge(lcs: lcs.LCS<Token>): Token[]{
  const results:Token[] = [];
  for(const cmp of lcs.getDiff()) {
    const token = cmp.equals ? cmp.unitA! : {t: undefined, c: TokenType.wildcard};
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
      if(
        (!t1.c && !t2.c && t1.t && t2.t &&  (t1.t === t2.t || porterStemmer(t1.t) === porterStemmer(t2.t) ))
        || (t1.c && t2.c && t1.c === t2.c) 
        || t1.c === TokenType.wildcard 
        || t2.c === TokenType.wildcard
      ) return true;
      return false;
    }
  });
  return results;
}



function clusteringOnce(inputs: Cluster[], minSimilarity: number) : Cluster[] {
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
        const clusterPattern = cluster.pattern ? cluster.pattern : cluster.represent;
        if(!clusterPattern) throw Error(`invalid cluster: ${JSON.stringify(cluster)}`);
        const results = compare(input.represent,  clusterPattern);
        const sim = results.getSimilarity();
        const content1 = input.representRaw?.content;
        const content2 = cluster.representRaw?.content;
        const isContain = content1 && content2 && input.represent.length > 1 && clusterPattern.length > 1 && (content1.startsWith(content2) || content2.startsWith(content1))
        if(sim >= minSimilarity || isContain) {
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
      if(!found) {
        const newCluster:Cluster = {...input};
        clusters.push(newCluster);
      }
    }
  }
  return clusters;
}

export function compressPattern(tokens: Token[]) {
  const results: Token[] = [];
  let preIsWC = false;
  for(const t of tokens) {
    if(t.c === TokenType.wildcard && preIsWC) {
      continue;
    }
    results.push(t);
    if(t.c === TokenType.wildcard) {
      preIsWC = true;
    }
    else {
      preIsWC = false;
    }
  }
  return results;
}
 
export function showPatternString(tokens: Token[]) {
  const array = tokens.map(t => {
    if(!t.c) return t.t;
    if(t.c === TokenType.wildcard) return "*";
    if(t.c === TokenType.witespace) return " ";
    return "<" + t.c + ">";
  });
  return array.join("");
}

export function abstractPattern(tokens: Token[]){
  for(const token of tokens) {
    if(token.c) {
      delete token.t;
    }
    else {
      delete token.c;
    }
  }
}

export function isWhitespace(character: string) {
  return /^\s+$/.test(character)
}