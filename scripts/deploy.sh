# export DOCKER_BUILDKIT=0
set -e
docker buildx build --platform linux/amd64 --provenance=false -f ../Dockerfile -t libreoffice-convert-lambda ..
docker tag libreoffice-convert-lambda:latest $(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-southeast-1.amazonaws.com/libreoffice-convert-lambda:latest
aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin $(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-southeast-1.amazonaws.com
docker push $(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-southeast-1.amazonaws.com/libreoffice-convert-lambda:latest

aws cloudformation deploy \
  --template-file ../cloudformation.yaml \
  --stack-name libreoffice-convert-lambda \
  --parameter-overrides Stage=development ImageUri=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-southeast-1.amazonaws.com/libreoffice-convert-lambda:latest \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-southeast-1