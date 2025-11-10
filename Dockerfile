# 使用官方的 Node.js LTS Alpine 镜像作为基础镜像，体积小
FROM node:lts-alpine

# 设置工作目录
WORKDIR /app

# 1. 复制 package.json 和 package-lock.json (如果存在)
# 这样可以利用Docker的缓存机制，只有在依赖更新时才会重新执行 npm install
COPY package*.json ./

# 2. 安装项目依赖
# 我们也在这里安装一些常用的工具，以便调试
RUN apk update && apk add --no-cache curl && \
    npm install --production

# 3. 复制项目的其他所有文件
# .dockerignore 文件会确保不必要的文件不会被复制进来
COPY . .

# 暴露应用程序使用的端口
EXPOSE 3000

# 设置文件权限
RUN chmod +x app.js

# 定义容器启动时执行的命令
CMD ["node", "app.js"]
