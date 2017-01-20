"use strict";

// database
/*
use myGame 
db.createCollection("account");
db.createCollection("progress");
*/

var connectionString = process.env.MONGODB_URI;  // 'mongodb://localhost:27017/myGame';
var collections = ['account','progress'];
var pmongo = require('promised-mongo');
var db = pmongo(connectionString, collections);
console.log(db);

// file communication => express
// client asks server for file
var express = require('express');
var app = express();
var server = require('http').createServer(app);

app.get('/', function(req,res) {
    res.sendFile(__dirname + '/client/index.html');
});

app.use('/client', express.static(__dirname + '/client'));

server.listen(process.env.PORT || 2000);
console.log('Server started...');


var SOCKET_LIST = {};

class Entity {
    constructor() {
        this.x = 250;
        this.y = 250;
        this.spdX = 0;
        this.spdY = 0;
        this.id = "";
    }
    update() {
        this.updatePosition();
    }
    updatePosition() {
        this.x += this.spdX;
        this.y += this.spdY;
    }
    getDistance(pt) {
        return Math.sqrt(Math.pow(this.x - pt.x, 2) + Math.pow(this.y - pt.y, 2));
    }
}

class Player extends Entity {
    constructor(id) {
        super();
        this.id = id;
        this.number = "" + Math.floor(10 * Math.random());
        this.pressingRight = false;
        this.pressingLeft = false;
        this.pressingUp = false;
        this.pressingDown = false;
        this.pressingAttack = false;
        this.mouseAngle = 0;
        this.maxSpeed = 10;
        this.hp = 10;
        this.hpMax = 10;
        this.score = 0;
        Player.list[id] = this;
        initPack.player.push(this.getInitPack());
    }
    getInitPack() {
        return {
            id:this.id,
            number:this.number,
            x:this.x,
            y:this.y,
            hp:this.hp,
            hpMax:this.hpMax,
            score:this.score
        };
    }
    getUpdatePack() {
        return {
            id:this.id,
            x:this.x,
            y:this.y,
            hp:this.hp,
            score:this.score
        };
    }
    update() {
        this.updateSpeed();
        super.update();
        if(this.pressingAttack) {
            this.shootBullet(this.mouseAngle);
        }
    }
    updateSpeed() {
        if(this.pressingRight) {
            this.spdX += this.maxSpeed;
        } else if(this.pressingLeft) {
            this.spdX -= this.maxSpeed;
        } else {
            this.spdX = 0; }
        if(this.pressingUp) {
            this.spdY -= this.maxSpeed;
        } else if(this.pressingDown) {
            this.spdY += this.maxSpeed;
        } else {
            this.spdY = 0; }
    }
    shootBullet(angle) {
        var b = new Bullet(this.id,angle);
        b.x = this.x;
        b.y = this.y;
    }
}

Player.list = {};

Player.getAllInitPacks = function() {
    var players = [];
    for(var i in Player.list)
        players.push(Player.list[i].getInitPack());
    return players;
}
Player.onConnect = function(socket) {
    var player = new Player(socket.id);
    socket.emit('init', {
        socketID:socket.id,
        player:Player.getAllInitPacks(),
        bullet:Bullet.getAllInitPacks()
    });
    socket.on('keyPress', function(data) {
        if(data.input === 'right') {
            player.pressingRight = data.state;
        } else if(data.input === 'left') {
            player.pressingLeft = data.state;
        } else if(data.input === 'up') {
            player.pressingUp = data.state;
        } else if(data.input === 'down') {
            player.pressingDown = data.state;
        } else if(data.input === 'attack') {
            player.pressingAttack = data.state;
        } else if(data.input === 'mouseAngle') {
            player.mouseAngle = data.state;
        }
    });
};
Player.onDisconnect = function(socket) {
    delete Player.list[socket.id];
    removePack.player.push(socket.id);
};
Player.update = function() {
    var pack = [];
    for(var i in Player.list) {
        var player = Player.list[i];
        player.update();
        pack.push(player.getUpdatePack());
    }
    return pack;
};

class Bullet extends Entity {
    constructor(shooter,angle) {
        super();
        this.b_id = Math.random();
        this.spdX = Math.cos(angle/180*Math.PI) * 10;
        this.spdY = Math.sin(angle/180*Math.PI) * 10;
        this.timer = 0;
        this.toRemove = false;
        this.shooter = shooter;
        Bullet.list[this.b_id] = this;
        initPack.bullet.push(this.getInitPack());
    }
    getInitPack() {
        return {
            id:this.b_id,
            x:this.x,
            y:this.y
        };
    }
    getUpdatePack() {
        return {
            id:this.b_id,
            x:this.x,
            y:this.y
        };
    }
    update() {
        if(this.timer++ > 100) {
            this.toRemove = true;
        }
        super.update();
        for(var i in Player.list) {
            var p = Player.list[i];
            // handle collision
            if(this.getDistance(p) < 32 && this.shooter !== p.id) {
                p.hp -= 1;
                if(p.hp <= 0) {
                    var shooter = Player.list[this.shooter];
                    if(shooter)
                        shooter.score += 1;
                    p.hp = p.hpMax;
                    p.x = Math.random() * 500;
                    p.y = Math.random() * 500;
                }
                this.toRemove = true;
            }
        }
    }
}

Bullet.list = {};

Bullet.getAllInitPacks = function() {
    var bullets = [];
    for(var i in Bullet.list)
        bullets.push(Bullet.list[i].getInitPack());
    return bullets;
}
Bullet.update = function() {
    var pack = [];
    for(var i in Bullet.list) {
        var bullet = Bullet.list[i];
        bullet.update();
        if(this.toRemove)
            delete Bullet.list[i];
            removePack.bullet.push(bullet.id);
        pack.push(bullet.getUpdatePack());
    }
    return pack;
};



var DEBUG = false;



// signup
let isUsernameTaken = (data) => {
    return db.account.findOne({username:data.username});
}
let addUser = (data) => {
    return db.account.insert({username:data.username,password:data.password});
}

// signin
let isValidPassword = (data) => {
    return db.account.findOne({username:data.username,password:data.password});
}




// package communication => socket.io
// client sends data to server
// server sends data to client
var io = require('socket.io')(server,{});
io.sockets.on('connection', function(socket) {
    console.log('Socket Connection...');

    socket.id = Math.random();
    SOCKET_LIST[socket.id] = socket;

    // signin
    socket.on('signIn', function(data) {
        isValidPassword(data)
        .then((docs) => {
            return new Promise((resolve,reject) => {
                if(docs) {
                    resolve({success:true});
                } else {
                    reject({success:false});
                }
            });
        }).then((response) => {
            Player.onConnect(socket);
            socket.emit('signInResponse', response);
        }).catch((error) => {
            socket.emit('signInResponse', error);
        });
    });
    socket.on('signUp', function(data) {
        isUsernameTaken(data)
        .then((docs) => {
            return new Promise((resolve,reject) => {
                if(!docs) {
                    resolve({success:true});
                } else {
                    reject({success:false});
                }
            });
        }).then((response) => {
            addUser(data);
            socket.emit('signUpResponse', response);
        }).catch((error) => {
            socket.emit('signUpResponse', error);
        });
    });

    socket.on('disconnect', function() {
        delete SOCKET_LIST[socket.id];
        Player.onDisconnect(socket);
    });

    socket.emit('serverMessage', {
        msg: 'hello from server'
    });

    // must remove this before putting on public server!!!
    socket.on('evalServer', function(data) {
        if(!DEBUG) {
            return;
        }
        var res = eval(data);
        socket.emit('evalAnswer', res);
    });

    socket.on('sendMsgToServer', function(data) {
        var playerName = ("" + socket.id).slice(2,7);
        for(var i in SOCKET_LIST) {
            SOCKET_LIST[i].emit('addToChat', playerName + ': ' + data);
        }
    });


});


var initPack = {player:[],bullet:[]};
var removePack = {player:[],bullet:[]};

setInterval(function() {

    var pack = {
        player: Player.update(),
        bullet: Bullet.update()
    };

    for(var i in SOCKET_LIST) {
        var socket = SOCKET_LIST[i];
        socket.emit('init', initPack);
        socket.emit('update', pack);
        socket.emit('remove', removePack);
    }

    initPack.player = [];
    initPack.bullet = [];
    removePack.player = [];
    removePack.bullet = [];

}, 40);
