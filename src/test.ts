import porterStemmer from "@stdlib/nlp-porter-stemmer";
import { clustering, ILog } from ".";

const logs: ILog[] = [
  {content: "Ports: 3000, 5000 are already in use.", raw: "Ports: 3000, 5000 are already in use."},
  {content: "Ports: 3000, 9229 are already in use.", raw: "Ports: 3000, 9229 are already in use."},
  {content: "Ports: 3000, 9229 are already in use.", raw: "Ports: 3000, 9229 are already in use."},
  {content: "Port: 3001, 9229 are already in use.", raw: "Ports: 3000, 9229 are already in use."}
];

const clusters = clustering(logs); 
console.log(JSON.stringify(clusters)); 
 