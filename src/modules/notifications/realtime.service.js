const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { config } = require('../../config/env');
const { accountModel } = require('../accounts/account.model');

let io = null;

const roomFor = (role, id) => `${role}:${id}`;
const driverPoolRoom = category => `drivers:${category}`;

function attachRealtime(httpServer, isAllowedOrigin) {
    io = new Server(httpServer, {
        cors: {
            origin: (origin, callback) => callback(null, !origin || isAllowedOrigin(origin)),
            credentials: true,
        },
    });

    io.use(async (socket, next) => {
        try {
            const payload = jwt.verify(socket.handshake.auth?.token || '', config.jwtSecret);
            if (payload.typ !== 'socket') throw new Error('wrong token type');
            const account = await accountModel(payload.role).findById(payload.sub).select('tokenVersion status vehicle').lean();
            if (!account || (account.tokenVersion || 0) !== payload.tv) throw new Error('stale token');
            socket.data.auth = { id: payload.sub, role: payload.role, account };
            next();
        } catch (error) {
            next(new Error('unauthorized'));
        }
    });

    io.on('connection', socket => {
        const { id, role, account } = socket.data.auth;
        socket.join(roomFor(role, id));
        if (role === 'admin') socket.join('admins');
        if (role === 'driver' && account.status === 'approved' && account.vehicle?.category) {
            socket.join(driverPoolRoom(account.vehicle.category));
            socket.join('drivers:rentals');
        }
    });

    return io;
}

function emitTo(role, id, event, payload) {
    if (io && id) io.to(roomFor(role, id.toString())).emit(event, payload);
}

function emitToRoom(room, event, payload) {
    if (io) io.to(room).emit(event, payload);
}

module.exports = { attachRealtime, emitTo, emitToRoom, driverPoolRoom };
