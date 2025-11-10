# ===============================================================
# Dockerfile for the Nginx Reverse Proxy
# ===============================================================
FROM nginx:1.25-alpine

# 移除默认的 Nginx 欢迎页面配置
RUN rm /etc/nginx/conf.d/default.conf

# 复制我们自定义的站点配置文件
COPY default.conf /etc/nginx/conf.d/
