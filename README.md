# libreoffice-convert-lambda

An example of deploying AWS Lambda container images with SST, which is not
officially supported at the time of writing. This project wraps around
LibreOffice to convert Excel files to PDF.

Fonts have not been included in the repo for licensing reasons.

## Credits

- [@rayli09](https://github.com/rayli09) for the suggestion to use
  [this Pulumi example](https://github.com/pulumi/examples/blob/master/aws-ts-lambda-thumbnailer/index.ts)
  as a starting point.
- [libreoffice-lambda-base-image](https://github.com/shelfio/libreoffice-lambda-base-image)
  and [@jonathankeebler](https://github.com/jonathankeebler) for the
  [pull request updating LibreOffice](https://github.com/shelfio/libreoffice-lambda-base-image/pull/44).
