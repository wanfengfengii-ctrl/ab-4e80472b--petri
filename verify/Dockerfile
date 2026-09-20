# 与 playwright npm 版本保持一致，浏览器已预装于镜像中
FROM mcr.microsoft.com/playwright:v1.48.2-jammy
WORKDIR /work
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY run.mjs ./
ENV BASE_URL=http://web:80
# 一次性执行：场景跑完后进程退出，退出码即验收结果
CMD ["node", "run.mjs"]
