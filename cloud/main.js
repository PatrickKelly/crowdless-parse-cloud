var moment = require('moment');
var _ = require('cloud/underscore-min.js');

Parse.Cloud.job("UpdateCrowdScore", function (request, status) {

    console.log('Entering job:UpdateCrowdScore');

    var crowdScore = Parse.Object.extend('CrowdScore');
    var crowdScoreQuery = new Parse.Query(crowdScore);
    crowdScoreQuery.greaterThanOrEqualTo('updatedAt', moment().subtract('minutes', 150).toDate());
    crowdScoreQuery.equalTo('userUpdate', true);
    crowdScoreQuery.find({
        success: function (results) {

            if (results.length > 0) {

                var places = _.map(results, function (result) {
                    return result.get('place');
                });

                var uniquePlaces = _.unique(places, function (place) {
                    return place.id;
                });

                var time = moment().subtract('hours', 2).toDate();
                var userScore = Parse.Object.extend('UserScore');
                var query = new Parse.Query(userScore);
                var newCrowdScores = [];

                console.log('job:UpdateCrowdScore: Executing query for places: ' + JSON.stringify(uniquePlaces));
                query.containedIn('place', uniquePlaces);
                query.greaterThanOrEqualTo('updatedAt', time);
                query.find({
                    success: function (results) {

                        _.each(uniquePlaces, function(uniquePlace) {

                            var filteredResults = _.filter(results, function(userScore) {
                               return userScore.get('place').id == uniquePlace.id;
                            });

                            var CrowdScore = Parse.Object.extend('CrowdScore');
                            var cs = new CrowdScore();
                            cs.set('place', uniquePlace);
                            cs.set('crowded', calculateCrowdedScore(filteredResults));
                            cs.set('parkingDifficult', calculateParkingDifficultScore(filteredResults));
                            cs.set('coverCharge', calculateCoverChargeScore(filteredResults));
                            cs.set('waitTime', calculateWaitTimeScore(filteredResults));
                            cs.set('userUpdate', false);
                            newCrowdScores.push(cs);
                        });

                        Parse.Object.saveAll(newCrowdScores, {
                            success: function(savedCrowdScores) {
                                status.success('job:UpdateCrowdScore complete. All crowd scores updated.');
                            },
                            error: function(error) {
                                status.error('Error saving updated crowd scores: ' + error);
                            }
                        });
                    },

                    error: function (error) {
                        status.error('Error obtaining user crowd scores: ' + error);
                    }
                });

            } else {
                status.success('No crowd scores to update.');
            }
        },
        error: function (error) {
            status.error('Error retrieving crowd scores greater than 150 minutes: ' + error);
        }
    });

    console.log('Entering job:UpdateCrowdScore');
});

Parse.Cloud.afterSave('UserScore', function (request) {

    console.log('Entering after_save:UserScore');

    var time = moment().subtract('hours', 2).toDate();
    var userScore = Parse.Object.extend('UserScore');
    var query = new Parse.Query(userScore);
    var savedUserScore = request.object;
    var place = savedUserScore.get('place');
    var userScoreUpdatedAt = savedUserScore.get('updatedAt');

    query.equalTo('place', place);
    query.greaterThanOrEqualTo('updatedAt', time);
    query.find({
        success: function (results) {
            if (results.length > 0) {

                console.log('Updating crowd score for place: ' + place.id);

                var CrowdScore = Parse.Object.extend('CrowdScore');
                var cs = new CrowdScore();
                cs.set('place', place);
                cs.set('crowded', calculateCrowdedScore(results));
                cs.set('parkingDifficult', calculateParkingDifficultScore(results));
                cs.set('coverCharge', calculateCoverChargeScore(results));
                cs.set('waitTime', calculateWaitTimeScore(results));
                cs.set('userUpdate', true);
                cs.save();

            } else {
                console.error('No user crowd scores returned when querying for user crowd scores ' +
                    'after user save for request: ' + JSON.stringify(request));
            }
        },
        error: function (error) {
            console.error('Error updating crowd score after user save for request: ' + JSON.stringify(request) + ' with error: ' + error);
        }
    });

    console.log('Leaving after_save:UserScore');
});

Parse.Cloud.afterSave('CrowdScore', function (request) {

    console.log('Entering after_save:CrowdScore');

    var TrendingCrowdScore = Parse.Object.extend('TrendingCrowdScore');
    var trendingCrowdScoreQuery = new Parse.Query(TrendingCrowdScore);
    var place = request.object.get('place');
    var crowdScore = request.object;
    console.log('Place id in trending crowd score: ' + place.id);
    trendingCrowdScoreQuery.equalTo('place', place);
    trendingCrowdScoreQuery.descending('updatedAt');
    trendingCrowdScoreQuery.limit(1);
    trendingCrowdScoreQuery.find({
        success: function (results) {
            if (results.length > 0) {
                console.log('Updating trending crowd score for place: ' + place.id);
                var tcs = results[0];
                tcs.set('place', place);
                tcs.set('crowded', crowdScore.get('crowded'));
                tcs.set('parkingDifficult', crowdScore.get('parkingDifficult'));
                tcs.set('coverCharge', crowdScore.get('coverCharge'));
                tcs.set('waitTime', crowdScore.get('waitTime'));
                tcs.save();

            } else {
                console.log('Creating new trending crowd score for place: ' + place.id);
                var tcs = new TrendingCrowdScore();
                tcs.set('place', place);
                tcs.set('crowded', crowdScore.get('crowded'));
                tcs.set('parkingDifficult', crowdScore.get('parkingDifficult'));
                tcs.set('coverCharge', crowdScore.get('coverCharge'));
                tcs.set('waitTime', crowdScore.get('waitTime'));
                tcs.save();
            }
        },
        error: function (error ) {
            console.error('TrendingCrowdScore lookup failed with request: ' + request + ' with error: ' + error);
        }
    });

    console.log('Leaving after_save:CrowdScore');
});

function calculateAverage(elements) {
    var average = 0;

    if (elements.length > 0) {
        var sum = _.reduce(elements, function (memo, num) {
            return memo + num;
        }, 0);
        average = Math.round(sum / elements.length)
    }

    return average;
}

function calculateCrowdedScore(results) {

    var crowdedTimeThreshold = moment().subtract('minutes', 90).toDate();

    var crowdedScores = _.reduce(results, function (memo, result) {
        var crowded = result.get('crowded');
        var updatedTime = result.get('updatedAt');

        if (typeof crowded != "undefined" && updatedTime >= crowdedTimeThreshold) {
            memo.push(crowded);
        }

        return memo;

    }, []);

    return calculateAverage(crowdedScores);
}

function calculateParkingDifficultScore(results) {

    var parkingScores = _.reduce(results, function (memo, result) {
        var parkingDifficult = result.get('parkingDifficult');
        if (typeof parkingDifficult != "undefined") {
            memo.push(parkingDifficult);
        }

        return memo;
    }, []);

    return calculateAverage(parkingScores);
}

function calculateWaitTimeScore(results) {

    var waitTimeThreshold = moment().subtract('minutes', 15).toDate();

    var waitTimeScores = _.reduce(results, function (memo, result) {
        var waitTime = result.get('waitTime');
        var updatedTime = result.get('updatedAt');
        if (typeof waitTime != "undefined" && updatedTime >= waitTimeThreshold) {
            memo.push(waitTime);
        }

        return memo;
    }, []);

    return calculateAverage(waitTimeScores);
}

function calculateCoverChargeScore(results) {

    var coverChargeTimeThreshold = moment().subtract('minutes', 60).toDate();

    var waitTimeScores = _.reduce(results, function (memo, result) {
        var coverCharge = result.get('coverCharge');
        var updatedTime = result.get('updatedAt');
        if (typeof coverCharge != "undefined" && updatedTime >= coverChargeTimeThreshold) {
            memo.push(coverCharge);
        }

        return memo;
    }, []);

    return calculateAverage(waitTimeScores);
}