

const MYSQL_HOST = process.env.MYSQL_HOST || "localhost"
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || "hack_trip"
const MYSQL_USER = process.env.MYSQL_USER || "trayan"
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || "trayan"



const MYSQL ={
    host: MYSQL_HOST,
    database:MYSQL_DATABASE,
    user: MYSQL_USER,
    password : MYSQL_PASSWORD
}

const config={
    mysql:MYSQL
}

export default config