FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p uploads/documentos uploads/avatars

ENV PORT=10000
EXPOSE 10000

CMD ["node", "server.js"]
