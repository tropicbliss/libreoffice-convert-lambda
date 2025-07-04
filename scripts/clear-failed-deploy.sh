set -e
aws cloudformation delete-stack --stack-name libreoffice-convert-lambda --region ap-southeast-1
aws cloudformation wait stack-delete-complete --stack-name libreoffice-convert-lambda --region ap-southeast-1