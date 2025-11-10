# --- 阶段 1: 构建 Node.js 应用 ---
FROM node:lts-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .


# --- 阶段 2: 创建最终的生产镜像 ---
FROM nginx:1.25-alpine

# 安装 Node.js 和 npm
RUN apk update && apk add --no-cache nodejs npm

# 从 'builder' 阶段复制构建好的 Node.js 应用
COPY --from=builder /app /app

# 复制自定义的 Nginx 配置文件
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# [关键新增] 强制 Nginx 将日志输出到标准输出/错误流
# 创建符号链接，将日志文件路径指向 stdout 和 stderr
# 这样所有日志都会被 Docker log driver 捕获
RUN ln -sf /dev/stdout /var/log/nginx/access.log \
    && ln -sf /dev/stderr /var/log/nginx/error.log

# 暴露 Nginx 的 80 端口
EXPOSE 80

# 定义容器启动时执行的命令
# 直接运行我们的 Node.js 应用，它会内部启动 Nginx
CMD ["node", "/app/app.js"]
