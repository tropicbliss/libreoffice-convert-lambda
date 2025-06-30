FROM public.ecr.aws/lambda/nodejs:22-x86_64 AS base

# Adjust these values to update LibreOffice (choose the latest "LibreOffice Still" version)
ARG DOWNLOAD_URL=https://downloadarchive.documentfoundation.org/libreoffice/old/24.8.7.2/rpm/x86_64/LibreOffice_24.8.7.2_Linux_x86-64_rpm.tar.gz
ARG LIBREOFFICE_PATH=libreoffice24.8

ENV PATH=/var/lang/bin:/usr/local/bin:/usr/bin/:/bin:/opt/bin

# Configure linker to correctly point to libraries
ENV LD_LIBRARY_PATH="/usr/lib:/usr/lib64"

RUN dnf install -y libSM.x86_64 libXinerama-devel tar gzip nss-tools cups-libs libxslt fontconfig which && dnf clean all
RUN cp /lib64/libssl.so.3 /lib64/libssl3.so

RUN mkdir ~/libre && cd ~/libre && curl -s -L ${DOWNLOAD_URL} | tar xvz

RUN cd ~/libre/LibreOffice*/RPMS/ && rpm -Uvh *.rpm && rm -fr ~/libre && cd /opt/${LIBREOFFICE_PATH}/ && strip ./**/* || true
ENV HOME=/tmp
RUN dnf remove tar gzip -y

# Trigger dummy run to generate bootstrap files to improve cold start performance
RUN touch /tmp/test.txt \
  && cd /tmp \
  && ${LIBREOFFICE_PATH} --headless --invisible --nodefault --view \
  --nolockcheck --nologo --norestore --convert-to pdf \
  --outdir /tmp /tmp/test.txt \
  && rm /tmp/test.txt

FROM base AS builder
WORKDIR /app
COPY package*json tsconfig.json src ./
COPY sst-env.d.ts* ./
RUN npm ci && \
  npm run build && \
  npm prune --production

FROM base AS runner
COPY fonts/* /usr/share/fonts/truetype/custom/
RUN fc-cache -fv
COPY --from=builder /app/node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY --from=builder /app/dist ${LAMBDA_TASK_ROOT}
COPY --from=builder /app/package.json ${LAMBDA_TASK_ROOT}/package.json
ENV LIBREOFFICE_PATH=$LIBREOFFICE_PATH
CMD [ "index.handler" ]