set -e
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
docker buildx build --platform linux/amd64 --provenance=false -f ../Dockerfile -t libreoffice-convert-lambda ..
docker tag libreoffice-convert-lambda:latest $ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com/libreoffice-convert-lambda:latest
aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com
docker push $ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com/libreoffice-convert-lambda:latest

DIGEST=$(aws ecr describe-images --repository-name libreoffice-convert-lambda --image-ids imageTag=latest --query 'imageDetails[0].imageDigest' --output text --region ap-southeast-1)
IMAGE_URI="$ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com/libreoffice-convert-lambda@$DIGEST"
aws cloudformation deploy \
  --template-file ../cloudformation.yaml \
  --stack-name libreoffice-convert-lambda \
  --parameter-overrides Stage=development ImageUri=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-southeast-1.amazonaws.com/libreoffice-convert-lambda:latest ImageUri=$IMAGE_URI \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-southeast-1