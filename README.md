# Genetic Basket Ball

> Api's are build within Exapress, Node.js & MongoDB

## Usage

### ES Modules in Node

We use ECMAScript Modules in the backend in this project. Be sure to have at least Node v14.6+ or you will need to add the "--experimental-modules" flag.

Also, when importing a file (not a package), be sure to add .js at the end or you will get a "module not found" error

You can also install and setup Babel if you would like

### Env Variables

Create a .env file in then root and add the following

```
PORT = 8000
ENVIRONMENT = Development / Production
DEV_MONGODB_URI = Development mongodb URI
PROD_MONGODB_URI = Production mongodb URI
JWT_SECRET = your jwt secret here
YOUR_EMAIL= your email
YOUR_PASS= your email password
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
SENDER_EMAIL= sender email or you can use YOU_EMAIL
```

### Install Dependencies

```
npm install

```

### Run

```
npm start

```
