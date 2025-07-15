# libreoffice-convert-lambda

An example of deploying AWS Lambda container images with SST, which is not
officially supported at the time of writing. This project wraps around
LibreOffice to convert Excel files to PDF.

P.S.: There's a CloudFormation branch that provides a CloudFormation sample that
does the same thing if you really want to suffer a bit more.

Fonts have not been included in the repo for licensing reasons.

## Credits

- [@rayli09](https://github.com/rayli09) for the suggestion to use
  [this Pulumi example](https://github.com/pulumi/examples/blob/master/aws-ts-lambda-thumbnailer/index.ts)
  as a starting point.
- [libreoffice-lambda-base-image](https://github.com/shelfio/libreoffice-lambda-base-image)
  and [@jonathankeebler](https://github.com/jonathankeebler) for the
  [pull request updating LibreOffice](https://github.com/shelfio/libreoffice-lambda-base-image/pull/44).
- [Sample Excel files](https://github.com/bharathirajatut/sample-excel-dataset)
  for pre-warming LibreOffice.
