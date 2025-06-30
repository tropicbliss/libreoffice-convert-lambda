import { execSync } from "child_process";
import { Resource } from "sst";

const command = `aws s3 rm s3://${Resource.Bucket.name} --recursive`;
console.log(command);
execSync(command);
