/// <reference path="./.sst/platform/config.d.ts" />
export default $config({
  app(input) {
    return {
      name: "file-download-test",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          region: "ap-southeast-1",
        },
        awsx: "2.22.0",
      },
    };
  },
  async run() {
    const repo = new awsx.ecr.Repository("repo", {
      forceDelete: true,
    });
    const image = new awsx.ecr.Image("image", {
      context: "../../",
      repositoryUrl: repo.url,
    });
    const role = new aws.iam.Role("converterRole", {
      assumeRolePolicy: {
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Principal: {
            Service: "lambda.amazonaws.com",
            AWS: $interpolate`arn:aws:iam::${
              aws.getCallerIdentityOutput({}).accountId
            }:root`,
          },
          Action: "sts:AssumeRole",
        }],
      },
    });
    new aws.iam.RolePolicyAttachment(
      "lambdaFullAccess",
      {
        role: role.name,
        policyArn:
          "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      },
    );
    const converter = new aws.lambda.Function("converter", {
      packageType: "Image",
      imageUri: image.imageUri,
      role: role.arn,
      timeout: 45,
      memorySize: 3008,
    });
    const url = new aws.lambda.FunctionUrl("url", {
      functionName: converter.name,
      authorizationType: "NONE",
    });
    return {
      Function: url.functionUrl,
    };
  },
});
