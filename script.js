// Navigation
function navigateTo(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
    
    if (screenId === 'play-online') {
        initPeer();
    }
}

// Common Chess Game Logic
let board = null;
let game = new Chess();
let botGameType = 'local'; // 'local', 'bot', 'online', 'puzzle'

function onDragStart(source, piece, position, orientation) {
    if (game.game_over()) return false;
    
    // Only pick up pieces for the side to move
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }

    // specific rules for online play
    if (botGameType === 'online') {
        if (playerColor !== game.turn()) return false;
    }
    
    selectedSquare = source;
    highlightPossibleMoves(source);
}

function onDrop(source, target) {
    selectedSquare = null;
    removeHighlights();

    let move = game.move({
        from: source,
        to: target,
        promotion: 'q' // NOTE: always promote to a queen for example simplicity
    });

    if (move === null) return 'snapback';

    updateStatus();

    if (botGameType === 'bot') {
        window.setTimeout(makeBotMove, 250);
    } else if (botGameType === 'online') {
        sendMove(source, target);
    } else if (botGameType === 'puzzle') {
        checkPuzzleMove(source, target);
    }
}

function onSnapEnd() {
    board.position(game.fen());
}

function updateStatus() {
    let statusText = '';
    let moveColor = game.turn() === 'w' ? 'White' : 'Black';

    if (game.in_checkmate()) {
        statusText = 'Game over, ' + moveColor + ' is in checkmate.';
    } else if (game.in_draw()) {
        statusText = 'Game over, drawn position';
    } else {
        statusText = moveColor + ' to move';
        if (game.in_check()) {
            statusText += ', ' + moveColor + ' is in check';
        }
    }

    let statusId = botGameType + '-status';
    let statusEl = document.getElementById(statusId);
    if(statusEl) statusEl.innerText = statusText;
}

let selectedSquare = null;

function removeHighlights() {
    $('.square-55d63').removeClass('highlight-selected possible-move');
}

function handleSquareClick(square) {
    if (game.game_over()) return;
    
    if (botGameType === 'online' && playerColor !== game.turn()) return;

    if (selectedSquare) {
        let move = game.move({
            from: selectedSquare,
            to: square,
            promotion: 'q'
        });
        
        if (move === null) {
            let piece = game.get(square);
            if (piece && piece.color === game.turn()) {
                selectedSquare = square;
                highlightPossibleMoves(square);
            } else {
                selectedSquare = null;
                removeHighlights();
            }
        } else {
            selectedSquare = null;
            removeHighlights();
            board.position(game.fen());
            updateStatus();
            
            if (botGameType === 'bot') {
                window.setTimeout(makeBotMove, 250);
            } else if (botGameType === 'online') {
                sendMove(move.from, move.to);
            } else if (botGameType === 'puzzle') {
                checkPuzzleMove(move.from, move.to);
            }
        }
    } else {
        let piece = game.get(square);
        if (piece && piece.color === game.turn()) {
            selectedSquare = square;
            highlightPossibleMoves(square);
        }
    }
}

function highlightPossibleMoves(square) {
    removeHighlights();
    $('.square-' + square).addClass('highlight-selected');
    
    let moves = game.moves({
        square: square,
        verbose: true
    });
    
    for (let i = 0; i < moves.length; i++) {
        $('.square-' + moves[i].to).addClass('possible-move');
    }
}

$(document).on('click', '.square-55d63', function() {
    let square = $(this).attr('data-square');
    handleSquareClick(square);
});

// --- Local Play ---
function startLocalGame() {
    document.querySelector('.local-setup').classList.add('hidden');
    document.getElementById('local-game-container').classList.remove('hidden');
    
    botGameType = 'local';
    game = new Chess();
    
    let config = {
        draggable: true,
        moveSpeed: 300,
        snapbackSpeed: 400,
        snapSpeed: 150,
        position: 'start',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd
    };
    board = Chessboard('local-board', config);
    updateStatus();
}

function resetLocalGame() {
    game.reset();
    board.start();
    updateStatus();
}

// --- Bot Play (Stockfish) ---
// Load stockfish via Blob to avoid Cross-Origin Worker SecurityError
let stockfishBlob = new Blob([
    "importScripts('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');"
], { type: 'application/javascript' });
let stockfish = new Worker(URL.createObjectURL(stockfishBlob));
let botDifficulty = 5;

stockfish.onmessage = function(event) {
    let line = event.data;
    if (line && line.indexOf('bestmove') > -1) {
        let match = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/);
        if (match) {
            game.move({ from: match[1], to: match[2], promotion: match[3] || 'q' });
            board.position(game.fen());
            updateStatus();
        }
    }
};

function startBotGame() {
    botDifficulty = parseInt(document.getElementById('bot-difficulty').value);
    document.querySelector('.difficulty-selector').classList.add('hidden');
    document.getElementById('bot-game-container').classList.remove('hidden');
    
    botGameType = 'bot';
    game = new Chess();
    
    let config = {
        draggable: true,
        moveSpeed: 300,
        snapbackSpeed: 400,
        snapSpeed: 150,
        position: 'start',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd
    };
    board = Chessboard('bot-board', config);
    updateStatus();
    
    // Init stockfish
    stockfish.postMessage('uci');
    stockfish.postMessage('isready');
}

function makeBotMove() {
    if (game.game_over()) return;
    
    stockfish.postMessage('position fen ' + game.fen());
    stockfish.postMessage('go depth ' + botDifficulty);
}

function resetBotGame() {
    game.reset();
    board.start();
    document.querySelector('.difficulty-selector').classList.remove('hidden');
    document.getElementById('bot-game-container').classList.add('hidden');
}


// --- Online Play (PeerJS) ---
let peer;
let conn;
let playerColor = 'w';

function initPeer() {
    if(peer) return;
    peer = new Peer();
    peer.on('open', function(id) {
        document.getElementById('my-peer-id').innerText = id;
    });

    peer.on('connection', function(c) {
        conn = c;
        playerColor = 'b'; // Receiver plays black
        setupConnection();
        startOnlineGame();
    });
}

function copyPeerId() {
    navigator.clipboard.writeText(document.getElementById('my-peer-id').innerText);
    alert("ID Copied!");
}

function connectToFriend() {
    let friendId = document.getElementById('friend-id').value;
    if (!friendId) return alert('Enter a valid ID');
    
    conn = peer.connect(friendId);
    playerColor = 'w'; // Caller plays white
    setupConnection();
    startOnlineGame();
}

function setupConnection() {
    conn.on('open', function() {
        document.getElementById('online-status').innerText = 'Connected! ' + (playerColor === 'w' ? 'White to move.' : 'Waiting for White.');
    });
    
    conn.on('data', function(data) {
        if(data.type === 'move') {
            game.move({from: data.source, to: data.target, promotion: 'q'});
            board.position(game.fen());
            updateStatus();
        }
    });
}

function sendMove(source, target) {
    if(conn && conn.open) {
        conn.send({type: 'move', source: source, target: target});
    }
}

function startOnlineGame() {
    document.querySelector('.online-setup').classList.add('hidden');
    document.getElementById('online-game-container').classList.remove('hidden');
    
    botGameType = 'online';
    game = new Chess();
    
    let config = {
        draggable: true,
        moveSpeed: 300,
        snapbackSpeed: 400,
        snapSpeed: 150,
        position: 'start',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        orientation: playerColor === 'w' ? 'white' : 'black',
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd
    };
    board = Chessboard('online-board', config);
    updateStatus();
}

function resetOnlineGame() {
    if(conn) conn.close();
    document.querySelector('.online-setup').classList.remove('hidden');
    document.getElementById('online-game-container').classList.add('hidden');
}

// Removed redundant event listener
// --- Puzzles ---
let puzzles = [
    { fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1', move: 'f3g5' }, // Simple opening tactic
    { fen: '4r1k1/pp3ppp/2p5/8/8/8/PP3PPP/3R2K1 w - - 0 1', move: 'd1d8' } // Back rank mate
];
let currentPuzzle = 0;

function loadNextPuzzle() {
    document.querySelector('.puzzle-controls').classList.add('hidden');
    document.getElementById('puzzle-game-container').classList.remove('hidden');
    
    botGameType = 'puzzle';
    let puzzle = puzzles[currentPuzzle];
    game = new Chess(puzzle.fen);
    
    let config = {
        draggable: true,
        moveSpeed: 300,
        snapbackSpeed: 400,
        snapSpeed: 150,
        position: puzzle.fen,
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd
    };
    board = Chessboard('puzzle-board', config);
    document.getElementById('puzzle-status').innerText = 'Find the best move!';
}

function checkPuzzleMove(source, target) {
    let puzzle = puzzles[currentPuzzle];
    if (source + target === puzzle.move) {
        document.getElementById('puzzle-status').innerText = 'Correct! Loading next puzzle...';
        currentPuzzle = (currentPuzzle + 1) % puzzles.length;
        setTimeout(loadNextPuzzle, 1500);
    } else {
        game.undo();
        board.position(game.fen());
        document.getElementById('puzzle-status').innerText = 'Incorrect. Try again.';
    }
}
