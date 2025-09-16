import { parse } from "date-fns";

const input = "30-Jul-25";
const format = "dd-MMM-yy"; // matches "30-Jul-25"

const parsedDate = parse(input, format, new Date());

console.log(parsedDate); 
