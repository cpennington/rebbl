'use strict';
const db = require('../../lib/LeagueService.js')
  , configuration = require('../../lib/ConfigurationService.js')
  , rampup = require("../../lib/Rampup.js")
  , util = require('../../lib/util.js')
  , express = require('express')
  , router = express.Router({mergeParams: true});

router.get('/', util.checkCache, async function(req, res){
  let data = {standings:null, rounds:null, league:req.params.league };
  let comp = false;
  let league = req.params.league.toLowerCase();

  if(league == "open invitational"){
    league = new RegExp(`^ReBBL Open Invitational`, 'i');
  } else if (league === "playins - s10"){
    league = new RegExp(`^ReBBL Playoffs`,'i');
    comp = "Play-Ins Qualifier";
  } else if (league.toLowerCase() !== "greenhorn cup" && league.toLowerCase() !== "rebbll" && league.toLowerCase() !== "xscessively elfly league" && league.toLowerCase() !== "rabble" && league.toLowerCase() !== "eurogamer" ){
    league = new RegExp(`^REBBL[\\s-]+${league}`, 'i');
  }  
  else {
    if (league === "rabble"){
      league = "the rebbl rabble mixer";
    }
    if (league === "eurogamer"){
      league = "REBBL Eurogamer Open";
    }

    league = new RegExp(`^${league}`, 'i');
  }

  
  if( req.params.league.toLowerCase() === "rampup"){
    data.standings = await rampup.getCoachScore();
    data.rounds = await db.getDivisions(new RegExp(/rampup$/,"i"));
    res.render('rebbl/league/rampup', data);
  } else {
    data.cutoffs = configuration.getPlayoffTickets(req.params.league);
    data.standings = await db.getCoachScore(league, comp || null, true);
    data.rounds = await db.getDivisions(league);
    res.render('rebbl/league/index', data);
  }

});

module.exports = router;