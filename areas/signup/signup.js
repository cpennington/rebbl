'use strict';

const express = require('express')
  , cache = require('memory-cache')
  , signupService = require('../../lib/signupService')
  , router = express.Router();


// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
const ensureAuthenticated = function(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  req.session.returnUrl = req.baseUrl;
  res.redirect('/account/login');
};

const cacheCheck = function(req, res, next){
  let key = req.originalUrl || req.url;
  let cachedBody = cache.get(key);
  if (cachedBody) {
    res.send(cachedBody);
  } else {
    res.sendResponse = res.send;
    res.send = (body) => {
      cache.put(key, body);
      res.sendResponse(body);
    };
    next();
  }
};


router.get('/', ensureAuthenticated, async function(req, res){
  try{
    let user = await signupService.getExistingTeam(req.user.name);
    let signup = await signupService.getSignup(req.user.name);

    if (signup){
      signup.signedUp = true;
    } else if (user) {
      user.signedUp = false;
    }
    res.render('signup/overview', { user: signup || user || {reddit: req.user.name, isNew :true} });
  } catch (err){
    console.log(err);
  }
});

router.get('/change', ensureAuthenticated, async function(req, res){
  try {
    let user = await signupService.getExistingTeam(req.user.name);
    let signup = await signupService.getSignup(req.user.name);

    if(!signup && user){
      res.render('signup/signup-existing', { user: user});
      return;
    }

    if (!signup){
      res.render('signup/signup-new-coach', {user: req.user.name});
      return;
    }

    switch(signup.saveType){
      case "existing":
        res.render('signup/signup-existing', { user: signup || user});
        break;
      case "reroll":
        res.render('signup/signup-reroll', {user: signup});
        break;
      case "new":
        res.render('signup/signup-new-coach', {user: signup});
        break;
      default:
        res.render('signup/signup-new-coach', {user: req.user.name});
        break;
    }
  } catch (err){
    console.log(err);
  }
});

router.get('/reroll', ensureAuthenticated, async function(req, res){
  try {
    let user = await signupService.getExistingTeam(req.user.name);
    let signup = await signupService.getSignup(req.user.name);
    if (user) {
      user.team = "";
      user.race = "";
      res.render('signup/signup-reroll', { user: signup || user });
    }
    else {
      res.render('signup/signup-new-coach', { user: signup });
    }
  } catch (err){
    console.log(err);
  }
});



router.post('/confirm-existing', ensureAuthenticated, async function(req, res){
  try{
    //remove unwanted input
    delete req.body.coach;
    delete req.body.team;

    req.body.saveType = "existing";
    await signupService.saveSignup(req.user.name, req.body);

    res.redirect('/signup');
  } catch (err){
    console.log(err);
  }
});

router.post('/confirm-reroll', ensureAuthenticated, async function(req, res){
  try{
    //remove unwanted input
    delete req.body.coach;

    req.body.saveType = "reroll";
    let user = await signupService.saveSignup(req.user.name, req.body);

    if (user.error){
      res.render('signup/signup-reroll', {user: user});
    } else {
      res.render('signup/signup-confirmed-greenhorn', {user: user});
    }
  } catch (err){
    console.log(err);
  }
});

router.post('/confirm-new', ensureAuthenticated, async function(req, res){
  try {
    req.body.saveType = "new";
    let user = await signupService.saveSignup(req.user.name, req.body);

    if (user.error){
      res.render('signup/signup-new-coach', {user: user});
    } else {
      res.render('signup/signup-confirmed-greenhorn', {user: user});
    }
  } catch (err){
    console.log(err);
  }
});

router.post('/confirm-greenhorn', ensureAuthenticated, async function(req, res){
  try{
    await signupService.saveGreenhornSignup(req.user.name);

    res.redirect('/signup');
  } catch (err){
    console.log(err);
  }
});


router.post('/resign', ensureAuthenticated, async function(req,res){
  try{
    await signupService.resign(req.user.name);
    res.redirect('/signup');
  } catch (err){
    console.log(err);
  }
});

router.post('/resign-greenhorn', ensureAuthenticated, async function(req,res){
  try{
    await signupService.resignGreenhorn(req.user.name);
    res.redirect('/signup');
  } catch (err){
    console.log(err);
  }
});

router.get('/signups', cacheCheck, async function(req,res){
  try{
    let signups = await signupService.getSignups();

    signups = signups.sort(function(a,b){

      if(a.league > b.league) return 1;
      if(a.league < b.league) return -1;

      if(a.saveType.replace("reroll", "f") > b.saveType.replace("reroll", "f")) return 1;
      if(b.saveType.replace("reroll", "f") > a.saveType.replace("reroll", "f")) return -1;

      if (a.coach.toLowerCase() < b.coach.toLowerCase()) return -1;
      if (a.coach.toLowerCase() > b.coach.toLowerCase()) return 1;

      return 0;

    });

    res.render('signup/signups', {signups: signups});
  } catch (err){
    console.log(err);
  }
});


module.exports = router;