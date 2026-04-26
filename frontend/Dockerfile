FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY public ./public
COPY src ./src
ENV REACT_APP_API_URL=http://localhost:3001
EXPOSE 3000
CMD ["npm", "start"]
