FROM nginx:1.25-alpine

RUN rm /etc/nginx/conf.d/default.conf

# [修改] 从构建上下文的 nginx/ 目录下复制 default.conf
COPY nginx/default.conf /etc/nginx/conf.d/
