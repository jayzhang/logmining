 import { tokenize, toString} from "../src";

const token = tokenize("ABC,  \t\n\r 123.456 zhjay23@gmail.com");

console.log(token);

const str = toString(token);

console.log(str);

const token2 = tokenize(str);

console.log(token2);
