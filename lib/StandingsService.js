"use strict";

const
  cache = require("memory-cache")
  , dataService = require("./DataService.js").rebbl;

class StandingsService{
    async newScore(league, comp, season, opponent, points, tdDiff){

      const account = await dataService.getAccount({coach: opponent.coach.name});

      //Tropyy and donations have nohting to with standings other than that thsoe are shown on the standings page
      //Yes, you could have seperate API calls for those, but not really keen on adding roughly (2 * 20 * 14 =) 560 extra calls 
      const showDonation = (account && account.donations && account.showDonation) ? true: false;
      const trophy = (account && account.trophies) ? account.trophies.find(f => f.display) :null;
      
      return {
          id: opponent.coach.id,
          name: opponent.coach.name,
          showDonation: showDonation,
          trophy: trophy ? trophy.filename : false,
          league: league,
          competition: comp,
          season: season,
          team: opponent.team.name,
          teamId: opponent.team.id,
          race: opponent.team.race,
          points: points,
          games: 1,
          win: points === 3 ? 1 :0,
          loss: points === 0 ? 1 :0,
          draw: points === 1 ? 1 :0,
          tddiff: tdDiff
      }
    } 


    //calculate coach points per league/division
    async calculateAllStandings() {

      await dataService.removeStandings({});
      
      const res = await dataService.getSchedules({"match_uuid":{$ne:null}});


      let leagues = [...new Set(res.map(schedule => schedule.league))];

      leagues.map(async (league) => {
          let data = await dataService.getSchedules({"league": league});
          let comps = [...new Set(data.map(l => l.competition)  )];


          comps.map(async competition => {
              const result = await this._calculateStandings(league,competition)

              //Because Big O
              result.map(coach => {
                if (!coach.competition) {console.log(league); console.dir(coach);}
                coach.competition = coach.competition.replace(/divsion/i, 'Division') });





              if (result.length > 0){
                await dataService.insertStandings(result);
                await this._fixRaces();
              }
          });
      });

      
    };

    async updateStandings(league, competition){
      const result = await this._calculateStandings(league,competition)

      if (result.length > 0){
        await dataService.removeStandings({"league": new RegExp(league,"i"), "competition":new RegExp(competition,"i")});
        await dataService.insertStandings(result);
      }
    }


    async _calculateStandings(league, competition){
      let matches = await dataService.getSchedules({"league": new RegExp(league,"i"), "competition":new RegExp(competition,"i"), "match_uuid":{$ne:null}});
      let coaches = [];
      if (!Promise.each){
        Promise.each = async function(arr, fn) { // take an array and a function
          for(const item of arr) await fn(item);
       }
      }
      await Promise.each(matches, async match => {
          if (match.winner){
              var winner = coaches.find(function (c) {
                  return c.id === match.winner.coach.id 
                });
              
              var loserCoach = coaches.find(function (c) {
                  return c.id === (match.winner.coach.id === match.opponents[0].coach.id ? match.opponents[1].coach.id : match.opponents[0].coach.id)
              });
              
              var loser = match.winner.coach.id === match.opponents[0].coach.id ? match.opponents[1] : match.opponents[0];

              //process winner
              if(!winner){
                  winner = await this.newScore(league,competition,match.season, match.winner,3,match.winner.team.score - loser.team.score); 
                  coaches.push(winner);
              } else {
                  winner.games++;
                  winner.win++;
                  winner.points += 3;
                  winner.tddiff += (match.winner.team.score  - loser.team.score);
              }


              //process loser
              if(!loserCoach){
                  loserCoach = await this.newScore(league,competition,match.season,loser,0,loser.team.score-match.winner.team.score); 
                  coaches.push(loserCoach);
              } else {
                  loserCoach.games++;
                  loserCoach.loss++;
                  loserCoach.tddiff += loser.team.score-match.winner.team.score;
              }

          } else {
              //process both as a draw

              let coach = coaches.find(function (c) {
                  return c.id === match.opponents[0].coach.id
              });

              if (!coach) {
                  if (!match.opponents || !match.opponents[0] ){
                      console.dir(match);
                      return;
                  }
                  coach = await this.newScore(league,competition,match.season,match.opponents[0],1,0); 
                  coaches.push(coach);
              } else {
                  coach.games++;
                  coach.points++;
                  coach.draw++;
              }
      
              coach = coaches.find(function (c) {
                  return c.id === match.opponents[1].coach.id
              });
              if (!coach) {
                  coach = await this.newScore(league,competition,match.season,match.opponents[1],1,0); 
                  coaches.push(coach);
              } else {
                  coach.games++;
                  coach.points++;
                  coach.draw++;
              }
          }

      });

      //Calculate Strength
      coaches.map(c => c.strength = c.points/((c.win + c.draw + (c.loss > 1 ? 2 : c.loss))*3));

      coaches.map(coach => {
        let strengthOfSchedule = 0;

        const m = matches.filter(s => 
          s.opponents 
          && (s.opponents[0].coach.id === coach.id ||s.opponents[1].coach.id === coach.id) 
          && s.match_uuid
        );
  
        for (let index = 0; index < m.length; index++) {
          let match = m[index];
  
          const homeId = match.opponents[0].coach.id;

          const awayId = match.opponents[1].coach.id;

          let opponentCoach = homeId == coach.id
            ? coaches.find(n => n.id === awayId)
            : coaches.find(n => n.id === homeId);
  
          if (opponentCoach) strengthOfSchedule += opponentCoach.strength;
        }
        
        coach.strengthOfSchedule = strengthOfSchedule;
      });

      coaches = coaches.sort(
        function(a,b){
          //points
          if(a.points > b.points) {return -1} 
          if (b.points > a.points) {return 1} 
          
          //tie-breaker #1 : TD-diff
          if (a.tddiff > b.tddiff) {return -1} 
          if (b.tddiff > a.tddiff) {return 1} 
          
          //tie-breaker #2 : Loss diff
          if(a.loss > b.loss){return 1} 
          if(b.loss > a.loss){return -1} 
          
          //tie-breaker #3 : Head to Head
          let match = matches.find(function(s) {
            if (!s.opponents) return false;
            return s.competition === a.competition && ((s.opponents[0].coach.id === a.id && s.opponents[1].coach.id === b.id) || (s.opponents[1].coach.id === a.id && s.opponents[0].coach.id === b.id)) });

          if (match && match.winner){
            if (match.winner.coach.id === a.id) return -1;
            if (match.winner.coach.id === b.id) return 1;
          }

          if ("REBBL Eurogamer Open" === league){
            if (a.strengthOfSchedule > b.strengthOfSchedule) return -1;
            if (a.strengthOfSchedule < b.strengthOfSchedule) return 1;
          }

          return 0; 
        });

      coaches.map((coach,index) => coach.position = index+1);

      return coaches;
    }

    async _fixRaces(){
      const races = await dataService.getRaces();
  
      for(var x = 1; x < 26;x++){
  
          let race = races.find(r => r.id === x); 
          if (!race) continue;
          await dataService.updateStandings({"race":x},{$set:{"race":race.name}},{multi:true});
      }
      
  }
}

module.exports = new StandingsService();