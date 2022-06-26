import express, {json} from "express";
import cors from "cors";
import joi from "joi"
import dotenv from "dotenv"
import dayjs from "dayjs";
import chalk from "chalk";
import { MongoClient } from "mongodb"; // vai conectar a api ao database

const server = express()
server.use(json())
server.use(cors())

dotenv.config()

const mongoClient = new MongoClient(process.env.MONGO_URL) //criando a configuração da conexão
let database = null;

const promise = mongoClient.connect();
promise.then(() => {
    database = mongoClient.db(process.env.BANCO);
    console.log(chalk.green.bold("deu bom na conexão com o database"))
}).catch(e => {console.log("deu ruim", e)})



server.post(("/participants"), async (req, res)=>{
   const name = req.body;
   const schemaUsername = joi.object({
    name: joi.string().min(3).required()
})
   const validation = schemaUsername.validate( name ) //isso me retorna um objeto, do qual nos interessa o erro
   if (validation.error) {
    console.log(validation.error.details);
    res.status(422).send("erro de validação no nome")
    return
  }
    //verificar se já tenho o name no meu database
     
    try{
     const checkUser = await database.collection("users").findOne({name: name.name})
       if(checkUser){
        res.status(409).send("usuário já cadastrado")
        return
     
     }//mandar o nome pro banco de dados com insertOne
     await database.collection("users").insertOne({name: name.name, lastStatus: Date.now()})
     await database.collection("messages").insertOne({
      from: name.name, 
      to: 'Todos', 
      text: 'entra na sala...', 
      type: 'status', 
      time: dayjs().format('HH:mm:ss')}
     )
     res.status(201).send("usuario cadastrado")
    }
  
    catch(err){
    console.log(err)
    res.status(500).send("errro ao cadastrar usuário")
    return
     }
    

})

server.get(("/participants"), async (req, res)=>{
  try {
     const users = await database.collection("users").find().toArray()
    res.send(users)
    
  } catch (error) {
    console.log("erro ao retornar lit a de usuários",error)
    res.status(500).send("Erro ao obter os participantes!", e)
    return
  }

})

server.post(("/messages"), async (req, res) =>{
  const message = req.body
  const {user:from} = req.headers
  //validar as msgs 
  const schemaMessage = joi.object({
  to: joi.string().required(),
  text: joi.string().required(),
  type: joi.string().valid('message', 'private_message').required()
 })
 const validationTo = schemaMessage.validate(message)

   if(validationTo.error){
    res.sendStatus(422)
    return
   }

  console.log("user da header",from)
  try {
    //buscar pelo nome no banquinho,
    const validUser = await database.collection("users").findOne({name:from});
    console.log(from)
    if(!validUser){
      res.sendStatus(422)
      return
    }
    // montar a msg e enviar para o database

    await database.collection("messages").insertOne({
      from: from,
      to: message.to,
      text: message.text,
      type: message.type,
      time: dayjs().format("HH:mm:ss")
    })

    res.sendStatus(201)

  } catch (error) {
    res.status("erro ao mandar msgg").send(422)
    console.log("erro ao mandar msg ",error)
    return
  }
  
} )

server.get(("/messages"), async (req, res) => {
   //acessar o banco de dados e enviar as mensagens para o front
   //receber um limite de sgs a ser enviada por um parâmetro via query string
   const limit = parseInt(req.query.limit)
   const {user} = req.headers

   try {
     const messages = await database.collection("messages").find().toArray();
     const messagesReverse = messages.reverse()
     const limitedMessages = messages.filter((msg) =>{
      if((msg.to == 'Todos') || (msg.to == user) ||(msg.to == from)){
        return msg
      }
     })

     if (limit ==! NaN || limit ==!undefined){
       res.send(limitedMessages.slice(-limit))
     }
     res.send(limitedMessages)
    
   } catch (error) {
     console.log("erro ao cadstrar as msgs", error, "limite", limit);
     res.sendStatus(422);
     return
   }

})

server.post("/status", async (req, res)=>{
   const {user} = req.headers;
   try {
     const updatedUsers = await database.collection("users").findOne({name:user})
     if(!updatedUsers){
     return res.sendStatus(404)}
     //atualizar o database com o user e a hora
     await database.collection("users").updateOne({name:user}, { $set: { lastStatus: Date.now() } })
     res.sendStatus(200);
   } catch (err) {
    console.log("Erro ao atualizar status", err);
    res.sendStatus(500)
   }
   

})
//verificar lista de parti e remover qm estiver mais de 10 segundos

const checkTime = 15000

setInterval( async(req,res) => {
  const time = Date.now() - 10000 
  try {
    const inactiveParticipants = await database.collection("users").find({ lastStatus: { $lte: time } }).toArray();
    if (inactiveParticipants.length > 0) {
      const inativeMessages = inactiveParticipants.map(inactiveParticipant => {
        return {
          from: inactiveParticipant.name,
          to: 'Todos',
          text: 'sai da sala...',
          type: 'status',
          time: dayjs().format("HH:mm:ss")
        }
      });

      await database.collection("messages").insertMany(inativeMessages);
      await database.collection("users").deleteMany({ lastStatus: { $lte: time } });
    }
    
  } catch (err) {
    console.log("Deu ruim ao remover usuários ", err);
    res.sendStatus(500);
  }

},checkTime)





server.listen(process.env.PORT,()=>{
  console.log(chalk.blue.bold(`servidor no ar na porta ${process.env.PORT}`))
})


