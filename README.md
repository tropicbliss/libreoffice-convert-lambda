# libreoffice-convert-lambda

An example of deploying AWS Lambda container images with CloudFormation. This
project wraps around LibreOffice to convert Excel files to PDF.

Fonts have not been included in the repo for licensing reasons.

## 📋 Prerequisites

Before deploying, ensure you have the following installed and configured:

### Required Tools

- **AWS CLI** (v2.x recommended)
- **Docker** with buildx support
- **Make** (available on most Unix-like systems)
- **Git** (for cloning the repository)

### AWS Requirements

- AWS account with appropriate permissions
- AWS CLI configured with credentials (`aws configure`)
- Permissions for:
  - ECR (create repositories, push images)
  - Lambda (create functions, update code)
  - CloudFormation (create/update stacks)
  - IAM (create roles and policies)
  - API Gateway (create APIs and deployments)

### Verify Setup

```bash
# Check AWS CLI configuration
aws sts get-caller-identity

# Check Docker
docker --version
docker buildx version

# Check Make
make --version
```

## 🚀 Quick Start

### 1. Clone and Navigate

```bash
git clone <repository-url>
cd libreoffice-convert-lambda
```

### 2. Setup Fonts Directory

Place the `fonts` directory at the root of this directory. This ensures that
LibreOffice has access to the necessary fonts for proper document rendering
during PDF conversion.

```
libreoffice-convert-lambda/
├── fonts/              # <- Place your fonts directory here
│   ├── ...ttf
│   └── ... (other font files)
├── Dockerfile
├── Makefile
├── cloudformation.yaml
└── src/
```

**Note**: The fonts directory is required for proper text rendering in converted
PDFs. Without proper fonts, text may appear with incorrect formatting or missing
characters.

### 2. Configure Deployment

Edit the `Makefile` to customize your deployment:

```makefile
# Configuration section in Makefile
REGION := ap-southeast-1        # Change to your preferred AWS region
NAME := libreoffice-convert-lambda  # Change if you want a different name
```

### 3. Deploy Everything

```bash
# Full deployment (recommended for first time)
make all

# Or step by step
make validate      # Validate CloudFormation template
make create-ecr    # Create ECR repository
make deploy        # Build and deploy Lambda
```

### 4. Get Deployment Information

```bash
# Show API Gateway URL and other outputs
make outputs

# Show current stack status
make status
```

## 📖 Makefile Commands Reference

### Core Deployment Commands

| Command           | Description                                                   |
| ----------------- | ------------------------------------------------------------- |
| `make all`        | **Complete deployment** - validates, creates ECR, and deploys |
| `make deploy`     | Build Docker image and deploy Lambda function                 |
| `make validate`   | Validate CloudFormation template syntax                       |
| `make create-ecr` | Create ECR repository if it doesn't exist                     |

### Information Commands

| Command        | Description                                       |
| -------------- | ------------------------------------------------- |
| `make outputs` | Show CloudFormation stack outputs (API URL, etc.) |
| `make status`  | Show current deployment status                    |
| `make info`    | Show deployment configuration                     |
| `make help`    | Show all available commands                       |

### Development Commands

| Command             | Description                              |
| ------------------- | ---------------------------------------- |
| `make dev-deploy`   | Quick deployment without validation      |
| `make force-deploy` | Clear failed stack and redeploy          |
| `make debug`        | Show CloudFormation events for debugging |

### Cleanup Commands

| Command             | Description                        |
| ------------------- | ---------------------------------- |
| `make clean`        | Remove local Docker images         |
| `make clear-failed` | Delete failed CloudFormation stack |

## 🔧 Detailed Deployment Process

### What Happens During Deployment

1. **Validation**: CloudFormation template is validated for syntax errors
2. **ECR Setup**: ECR repository is created with security scanning enabled
3. **Docker Build**: Multi-platform Docker image is built with LibreOffice
4. **Image Push**: Docker image is pushed to ECR with latest tag
5. **Lambda Deploy**: CloudFormation stack creates/updates Lambda function
6. **API Gateway**: HTTP endpoint is configured for file uploads

### Build Process Details

```bash
# The build process includes:
docker buildx build --platform linux/amd64 --provenance=false -t libreoffice-convert-lambda .

# Image tagging for ECR
docker tag libreoffice-convert-lambda:latest 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/libreoffice-convert-lambda:latest

# Push to ECR
docker push 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/libreoffice-convert-lambda:latest
```

## 🌍 Multi-Region Deployment

To deploy to multiple regions:

```bash
# Deploy to US East
make deploy REGION=us-east-1

# Deploy to Europe
make deploy REGION=eu-west-1

# Deploy to Asia Pacific
make deploy REGION=ap-southeast-1
```

## Usage Examples

```javascript
const FormData = require("form-data");
const fs = require("fs");
const fetch = require("node-fetch");

async function processFileServerSide(filePath, apiUrl) {
  const formData = new FormData();
  const fileStream = fs.createReadStream(filePath);

  formData.append("uploaded_file", fileStream);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const buffer = await response.buffer();

    // Save processed file
    fs.writeFileSync("processed_file.pdf", buffer);

    return buffer;
  } catch (error) {
    console.error("Server-side processing failed:", error);
    throw error;
  }
}
```

## 🔍 Troubleshooting

### Common Issues and Solutions

#### 1. ECR Repository Already Exists

```bash
# Error: RepositoryAlreadyExistsException
# Solution: This is expected - the makefile handles this gracefully
```

#### 2. Docker Build Fails

```bash
# Check Docker daemon is running
docker ps

# Check buildx is available
docker buildx ls
```

#### 3. AWS Permissions Error

```bash
# Verify AWS credentials
aws sts get-caller-identity

# Check your permissions for ECR, Lambda, CloudFormation
aws iam get-user
```

#### 4. CloudFormation Stack Failed

```bash
# Check stack events
make debug

# Clear failed stack and retry
make force-deploy
```

#### 5. Image Push Timeout

```bash
# Check ECR login
aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com

# Manual push
docker push 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/libreoffice-convert-lambda:latest
```

### Debug Commands

```bash
# Show detailed CloudFormation events
make debug

# Check stack status
make status

# Show all outputs
make outputs

# Validate template only
make validate
```

## 🧪 Testing Your Deployment

### 1. Get API Endpoint

```bash
make outputs
# Look for "ApiUrl" in the output
```

### 2. Test File Upload

```bash
# Using curl
curl -X POST \
  -F "uploaded_file=@sample.xlsx" \
  https://your-api-id.execute-api.ap-southeast-1.amazonaws.com/development/ \
  -o converted.pdf

# Using web browser
# Navigate to the API URL and use the web form
```

### 3. Verify Conversion

- Check that the PDF file was created
- Verify the content matches your Excel file
- Test with different Excel file formats

## 🛡️ Security Considerations

### ECR Security

- Images are scanned for vulnerabilities on push
- Encryption at rest using AES256
- Private repository (not publicly accessible)

### Lambda Security

- IAM roles with minimal required permissions
- VPC configuration available if needed
- Environment variables for sensitive configuration

### API Gateway Security

- Consider adding authentication/authorization
- Rate limiting can be configured
- CORS settings available for web applications

## 🔄 Updates and Maintenance

### Updating the Lambda Function

```bash
# Just redeploy - it will update the existing function
make deploy
```

### Updating Dependencies

```bash
# Update Docker image and redeploy
make deploy
```

### Monitoring

```bash
# Check CloudWatch logs
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/libreoffice-convert-lambda"

# Check stack drift
aws cloudformation describe-stack-drift-detection-status --stack-name libreoffice-convert-lambda
```

## 🗑️ Cleanup

### Remove Everything

```bash
# Delete the CloudFormation stack
make clear-failed

# Clean up local Docker images
make clean

# Manually delete ECR repository if needed
aws ecr delete-repository --repository-name libreoffice-convert-lambda --force
```

## 📚 Additional Resources

- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [Amazon ECR Documentation](https://docs.aws.amazon.com/ecr/)
- [CloudFormation Documentation](https://docs.aws.amazon.com/cloudformation/)
- [LibreOffice Headless Mode](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html)

## 🆘 Support

If you encounter issues:

1. **Check the troubleshooting section** above
2. **Run debug commands** to gather information
3. **Check AWS CloudWatch logs** for Lambda execution errors
4. **Review CloudFormation events** for deployment issues

For persistent issues, gather the following information:

- Output from `make debug`
- CloudWatch logs from Lambda function
- Docker build logs
- AWS CLI version and configuration

## Credits

- [@rayli09](https://github.com/rayli09) for the suggestion to use
  [this Pulumi example](https://github.com/pulumi/examples/blob/master/aws-ts-lambda-thumbnailer/index.ts)
  as a starting point.
- [libreoffice-lambda-base-image](https://github.com/shelfio/libreoffice-lambda-base-image)
  and [@jonathankeebler](https://github.com/jonathankeebler) for the
  [pull request updating LibreOffice](https://github.com/shelfio/libreoffice-lambda-base-image/pull/44).
- [Sample Excel files](https://github.com/bharathirajatut/sample-excel-dataset)
  for pre-warming LibreOffice.
