import ws from 'ws';

let id = 0;

const MongoClient = require('mongodb').MongoClient;
const mongoClient = new MongoClient('mongodb://localhost:27017');

const makeSend = socket => data => {
  const str = JSON.stringify(data);

  socket.send(str);
}

export default port => {
  const server = new ws.Server({ port });
  console.log('Сервер запущен!');

  mongoClient.connect((err, dbclient) => {
    if (err) {
      console.log(err);
      return;
    }

    const connections = Object.create(null);
    const messages = dbclient.db('chat2').collection('messages');

    const sendUsers = () => {
      const users = [];
      for (let ip in connections) {
        users.push({
          name: connections[ip].name,
        });
      }
      
      for (let ip in connections) {
        connections[ip].send({
          event: 'users',
            data: {
              users
            }
        })
      }
    }

    const onMessage = (message, ip) => {
      try {
        message = JSON.parse(message);

        if (! message.event) return;

        switch(message.event) {
          case 'login': {
            const name = (message.data.name || '').trim();
            if (! name) return;

            connections[ip].name = name;

            const response = Object.create(null);
            const data = Object.create(null);

            data.result = 'done';
            data.name = name;

            response.event = 'loginResult';
            response.data = data;

            connections[ip].send(response);

            sendUsers();
            break;
          }
          case 'newMessage': {
            const text = (message.data.text || '').trim();
            if (! text) return;

            const data = Object.create(null);

            data.name = connections[ip].name;
            data.text = text;

            messages.insertOne(data, (err, result) => {
              if (err) {
                console.log('Message insertion failed! :', err);
                return;
              }

              const response = Object.create(null);

              response.event = 'message';
              response.data = data;

              for (let ip in connections) {
                connections[ip].send(response);
              }
            });
            break;
          }
          case 'deleteMessages': {
            messages.deleteMany({})
              .then(result => {
                const response = Object.create(null);
                const data = Object.create(null);

                data.messages = [];

                response.event = 'messages';
                response.data = data;

                for (let ip in connections) {
                  connections[ip].send(response);
                }
              })
              .catch(err => console.log(err));
            break;
          }
        }
      } catch(err) {}
    };

    const onConnection = (socket, req) => {
      const connection = Object.create(null);

      connection.ip = (id++) + req.connection.remoteAddress;
      
      connection.name = 'Новый пользователь';
      connection.send = makeSend(socket);

      connections[connection.ip] = connection;

      messages.find().toArray((err, results) => {
        if (err) {
          console.log(err);
          return;
        }

        connection.send({
          event: 'you',
          data: {
            name: connection.name
          }
        });

        connection.send({
          event: 'messages',
          data: {
            messages: results,
          }
        });

        sendUsers();
      });

      socket.on('message', message => {
        onMessage(message, connection.ip);
      });

      socket.on('close', () => {
        delete connections[connection.ip];
        
        sendUsers();
      })
    };
    
    server.on('connection', onConnection);
  });
}