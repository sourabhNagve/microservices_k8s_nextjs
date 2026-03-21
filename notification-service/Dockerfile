FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN addgroup -S app && adduser -S app -G app \
 && chown -R app:app /app

USER app

EXPOSE 3008

CMD ["npm", "start"]
