'use strict';

const express = require('express');
const exphbs = require('express-handlebars');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const mongoose = require('mongoose');
const validator = require('validator');
mongoose.Promise = global.Promise;

const app = express();

process.env.MONGO_URL = "mongodb://JBpNiv86H2sHewt:muVsPQDkZB1TasF@ds115671.mlab.com:15671/social-todo";
process.env.PORT = 8080;
mongoose.connect(process.env.MONGO_URL);

const Users = require('./models/users.js');
const Tasks = require('./models/tasks.js');

// Configure our app
const store = new MongoDBStore({
  uri: process.env.MONGO_URL,
  collection: 'sessions',
});
app.engine('handlebars', exphbs({
  defaultLayout: 'main',
}));
app.set('view engine', 'handlebars');
app.use(bodyParser.urlencoded({
  extended: true,
})); // for parsing application/x-www-form-urlencoded
// Configure session middleware that will parse the cookies
// of an incoming request to see if there is a session for this cookie.
app.use(session({
  secret: 'sdfs',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: 'auto',
  },
  store,
}));

// Middleware that looks up the current user for this sesssion, if there
// is one.
app.use((req, res, next) => {
  if (req.session.userId) {
    Users.findById(req.session.userId, (err, user) => {
      if (!err) {
        res.locals.currentUser = user;
      }
      next();
    });
  } else {
    next();
  }
});

// Middleware that checks if a user is logged in. If so, the
// request continues to be processed, otherwise a 403 is returned.
function isLoggedIn(req, res, next) {
  if (res.locals.currentUser) {
    next();
  } else {
    res.sendStatus(403);
  }
}

// Middleware that loads a users tasks if they are logged in.
function loadUserTasks(req, res, next) {
  if(!res.locals.currentUser) {
    return next();
  }
  else {
    Tasks.find({ $or:[
  			{owner: res.locals.currentUser},
  			{collaborators: res.locals.currentUser.email}
  		]}, function(err, task) {
        if(!err) {
          res.locals.tasks = task;
        }
        else {
          res.redirect('/');
        }
        next();
      }
    );
  }
}

// Return the home page after loading tasks for users, or not.
app.get('/', loadUserTasks, (req, res) => {
  res.render('index');
});

// Handle submitted form for new users
app.post('/user/register', (req, res) => {
  var post = req.body;
  res.locals.errors = [];
  if(post.password != post.passwordConfirmation)
  {
    res.locals.errors.push("Password Confirmation and Password are different");
    return res.render('index');
  }
  else
  {
    var newUser = new Users();
    newUser.email = post.email;
    newUser.name = post.name;
    newUser.hashed_password = post.password;
    
    newUser.save(function(err, userdata){

      if(userdata && !err){
        console.log('New User: '+ userdata.name);
        req.session.userId = userdata._id;
        res.redirect('/');
      }
      if(err){
        res.locals.errors.push("There\'s already an account with this email address");
        return res.render('index');
      }
    });
  }
});

app.post('/user/login', (req, res, next) => {
  var post = req.body;
  res.locals.errors = [];
  Users.findOne({email: post.email}, function(err, user){

    if(err || !user){
      res.locals.errors.push('Invalid email address');
      return res.render('index');
    }

    // See if the hash of their passwords match
    user.comparePassword(post.password, function(err, isMatch){
      if(err || !isMatch){
        res.locals.errors.push('Invalid password');
        return res.render('index');
      }else{
        req.session.userId = user._id;
        res.redirect('/');
      }
    });
  });
});


// Log a user out
app.get('/user/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

//  All the controllers and routes below this require
//  the user to be logged in.
app.use(isLoggedIn);

// Handle submission of new task form
app.post('/tasks/:id/:action(complete|incomplete)', (req, res) => {
  res.locals.errors = [];
  Tasks.findById(req.params.id, function(err, task){
    
    if(err || !task){
      res.locals.errors.push('Could not edit task');
      return res.render('index');
    }
    else {
      if(task.isComplete){
        task.isComplete = false;
      }
      else {
        task.isComplete = true;
      }
      task.save();
      res.redirect("/");
    }
  });
});

app.post('/tasks/:id/delete', (req, res) => {
  res.locals.errors = [];
  Tasks.findById(req.params.id, function(err, task){
    if(err || !task){
      res.locals.errors.push('Could not delete task');
      return res.render('index');
    }
    else {
      task.remove();
      res.redirect("/");
    }
  });
});

// Handle submission of new task form
app.post('/task/create', (req, res) => {
  var post = req.body;
  res.locals.errors = [];
  var newTask = new Tasks();
  newTask.owner = res.locals.currentUser._id;
  newTask.name = post.name;
  newTask.description = post.description;
  newTask.isComplete = false;
  newTask.collaborators = [post.collaborator1, post.collaborator2, post.collaborator3];
  newTask.save(function(err, savedTask){
    if(err || !savedTask){
      res.locals.errors.push('Error saving task!');
      return res.render('index');
    }else{
      res.redirect('/');
    }
  });
});

// Start the server
app.listen(process.env.PORT, () => {
  console.log(`Example app listening on port ${process.env.PORT}`);
});