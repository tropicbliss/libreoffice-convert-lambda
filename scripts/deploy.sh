REGION="ap-southeast-1"
NAME="libreoffice-convert-lambda"

set -e
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
docker buildx build --platform linux/amd64 --provenance=false -f ../Dockerfile -t $NAME ..
docker tag $NAME:latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$NAME:latest
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$NAME:latest

DIGEST=$(aws ecr describe-images --repository-name $NAME --image-ids imageTag=latest --query 'imageDetails[0].imageDigest' --output text --region $REGION)
IMAGE_URI="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$NAME@$DIGEST"
aws cloudformation deploy \
  --template-file ../cloudformation.yaml \
  --stack-name $NAME \
  --parameter-overrides Stage=development ImageUri=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$REGION.amazonaws.com/$NAME:latest ImageUri=$IMAGE_URI \
  --capabilities CAPABILITY_NAMED_IAM \
  --region $REGION
aws cloudformation describe-stacks --stack-name $NAME --query 'Stacks[0].Outputs' --region $REGION