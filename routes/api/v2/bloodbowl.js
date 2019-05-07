'use strict';
const   dataService = require("../../../lib/DataService.js").rebbl
  , express = require('express')
  , skills = require("../../../datastore/skillDescriptions.js")
  , util = require('../../../lib/util.js');

class BloodBowlApi{
  constructor(){
    this.router = express.Router({mergeParams: true})
  }

  routesConfig(){
    this.router.get('/skills', util.checkCache, async function(req, res){
      res.json(skills.skillDescriptions);
    });
    
    this.router.get('/playertypes/:race', util.checkCache, async function(req, res){
      let data = await dataService.getPlayerTypes({race:Number(req.params.race)});
      res.json(data);
    });
    
    this.router.get('/starplayers', util.checkCache, async function(req, res){
      let data = await dataService.getStarPlayers({});
      res.json(data);
    });
    
    return this.router;
  }
}

module.exports = BloodBowlApi;