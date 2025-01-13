FROM node:20
RUN apt-get update && apt-get install -y python3
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 8080
CMD [ "node", "app.js" ]