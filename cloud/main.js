var moment = require('moment');
var _ = require('cloud/underscore-min.js');

Parse.Cloud.job("UpdateCrowdScore", function (request, status) {

    console.log('Entering job:UpdateCrowdScore');

    var crowdScore = Parse.Object.extend('CrowdScore');
    var crowdScoreQuery = new Parse.Query(crowdScore);
    crowdScoreQuery.greaterThanOrEqualTo('lastUserUpdateTime', moment().subtract('minutes', 150).toDate());
    crowdScoreQuery.limit = 1000;
    crowdScoreQuery.find({
        success: function (results) {

            if (results.length > 0) {

                var time = moment().subtract('hours', 2).toDate();
                var userScore = Parse.Object.extend('UserScore');
                var query = new Parse.Query(userScore);
                var crowdScores = results;
                var newCrowdScores = [];

                query.containedIn('crowdScore', crowdScores);
                query.greaterThanOrEqualTo('updatedAt', time);
                query.limit = 1000;
                query.find({
                    success: function (userScores) {

                        _.each(crowdScores, function(crowdScore) {

                            var filteredResults = _.filter(userScores, function(userScore) {
                               return userScore.get('crowdScore').id == crowdScore.id;
                            });

                            crowdScore.set('crowded', calculateCrowdedScore(filteredResults));
                            crowdScore.set('parkingDifficult', calculateParkingDifficultScore(filteredResults));
                            crowdScore.set('coverCharge', calculateCoverChargeScore(filteredResults));
                            crowdScore.set('waitTime', calculateWaitTimeScore(filteredResults));
                            crowdScore.set('recentUserScoreCount', filteredResults.length);
                            newCrowdScores.push(crowdScore);
                        });

                        Parse.Object.saveAll(newCrowdScores, {
                            success: function(savedCrowdScores) {
                                status.success('job:UpdateCrowdScore complete. All crowd scores updated.');
                            },
                            error: function(error) {
                                status.error('Error saving updated crowd scores: ' + JSON.stringify(error));
                            }
                        });
                    },

                    error: function (error) {
                        status.error('Error obtaining user crowd scores: ' + JSON.stringify(error));
                    }
                });

            } else {
                status.success('No crowd scores to update.');
            }
        },
        error: function (error) {
            status.error('Error retrieving crowd scores greater than 150 minutes: ' + JSON.stringify(error));
        }
    });

    console.log('Entering job:UpdateCrowdScore');
});

Parse.Cloud.afterSave('UserScore', function (request) {

    console.log('Entering after_save:UserScore');

    var savedUserScore = request.object;

    var userScore = Parse.Object.extend('UserScore');
    var query = new Parse.Query(userScore);

    var time = moment(savedUserScore.get('updatedAt')).subtract('hours', 2).toDate();
    var place = savedUserScore.get('place');
    var crowdScore = savedUserScore.get('crowdScore');
    query.equalTo('place', place);
    query.greaterThanOrEqualTo('updatedAt', time);
    query.find({
        success: function (results) {
            if (results.length > 0) {

                console.log('Updating crowd score for place: ' + place.id);
                crowdScore.set('place', place);
                crowdScore.set('crowded', calculateCrowdedScore(results));
                crowdScore.set('parkingDifficult', calculateParkingDifficultScore(results));
                crowdScore.set('coverCharge', calculateCoverChargeScore(results));
                crowdScore.set('waitTime', calculateWaitTimeScore(results));
                crowdScore.set('lastUserUpdateTime', savedUserScore.get('updatedAt'));
                crowdScore.increment('recentUserScoreCount');
                crowdScore.save();

            } else {
                console.error('No user crowd scores returned when querying for user crowd scores ' +
                    'after user save for request: ' + JSON.stringify(request));
            }
        },
        error: function (error) {
            console.error('Error updating crowd score after user save for request: '
                + JSON.stringify(request) + ' with error: ' + JSON.stringify(error));
        }
    });

    console.log('Leaving after_save:UserScore');
});

Parse.Cloud.afterDelete('UserScore', function(request) {
    console.log('Entering after_delete:UserScore');

    var deletedUserScore = request.object;

    var userScore = Parse.Object.extend('UserScore');
    var query = new Parse.Query(userScore);

    var time = moment(deletedUserScore.get('updatedAt')).subtract('hours', 2).toDate();
    var place = deletedUserScore.get('place');
    var crowdScore = deletedUserScore.get('crowdScore');
    query.equalTo('place', place);
    query.greaterThanOrEqualTo('updatedAt', time);
    query.find({
        success: function (results) {
            if (results.length > 0) {

                console.log('Updating crowd score for place: ' + place.id);
                crowdScore.set('place', place);
                crowdScore.set('crowded', calculateCrowdedScore(results));
                crowdScore.set('parkingDifficult', calculateParkingDifficultScore(results));
                crowdScore.set('coverCharge', calculateCoverChargeScore(results));
                crowdScore.set('waitTime', calculateWaitTimeScore(results));
                crowdScore.set('lastUserUpdateTime', results[0].get('updatedAt'));
                crowdScore.increment('recentUserScoreCount', -1);
                crowdScore.save();

            } else {
                console.log('No user crowd scores returned when querying for user crowd scores ' +
                    'after user delete for request: ' + JSON.stringify(request) + '. Resetting back to defaults.');

                crowdScore.set('place', place);
                crowdScore.set('crowded', 0);
                crowdScore.set('parkingDifficult', 0);
                crowdScore.set('coverCharge', 0);
                crowdScore.set('waitTime', 0);
                crowdScore.unset('lastUserUpdateTime');
                crowdScore.set('recentUserScoreCount', 0);
                crowdScore.save();
            }
        },
        error: function (error) {
            console.error('Error updating crowd score after user delete for request: ' + JSON.stringify(request) +
                ' with error: ' + JSON.stringify(error));
        }
    });

    console.log('Leaving after_delete:UserScore');
});

Parse.Cloud.afterSave('Place', function (request) {

    console.log('Entering before_save:Place');

    //create new crowd score for this place if it's new
    var place = request.object;
    var createdAt = request.object.get("createdAt");
    var updatedAt = request.object.get("updatedAt");
    var objectExisted = (createdAt.getTime() != updatedAt.getTime());
    if (!objectExisted) {
        var CrowdScore = Parse.Object.extend('CrowdScore');
        var cs = new CrowdScore();
        cs.set('place', place);
        cs.set('crowded', 0);
        cs.set('parkingDifficult', 0);
        cs.set('coverCharge', 0);
        cs.set('waitTime', 0);
        cs.set('recentUserScoreCount', 0);
        cs.save();
    }

    console.log('Leaving before_save:Place');
});

Parse.Cloud.beforeSave('UserScore', function(request, response) {
    if (!request.object.get('helpfulCount')) {
        request.object.set('helpfulCount', 0);
    }

    if (!request.object.get('reportedCount')) {
        request.object.set('reportedCount', 0);
    }

    response.success();
});

Parse.Cloud.beforeSave('UserScorePeerComment', function (request, response) {
    console.log('Entering after_save:UserScorePeerComment');

    Parse.Cloud.useMasterKey();
    var userScorePeerComment = request.object;
    var userScore = request.object.get('userScore');

    if (userScorePeerComment.isNew()) {
        if (userScorePeerComment.get('helpful')) {
            userScore.increment('helpfulCount')
        } else {
            userScorePeerComment.set('helpful', false);
        }

        if (userScorePeerComment.get('reported')) {
            userScore.increment('reportedCount')
        } else {
            userScorePeerComment.set('reported', false);
        }

        userScore.save();

    } else {

        if (userScorePeerComment.dirty('helpful')) {
            if (userScorePeerComment.get('helpful')) {
                userScore.increment('helpfulCount')
            } else {
                userScore.increment('helpfulCount', -1);
            }
            userScore.save();
        }

        if (userScorePeerComment.dirty('reported')) {
            if (userScorePeerComment.get('reported')) {
                userScore.increment('reportedCount')
            } else {
                userScore.increment('reportedCount', -1);
            }
            userScore.save();
        }
    }

    response.success();

    console.log('Leaving after_save:UserScorePeerComment')
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