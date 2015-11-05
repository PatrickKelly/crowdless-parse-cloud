var moment = require('moment');
var _ = require('underscore');

Parse.Cloud.define('getCrowdScoreForPlace', function (request, response) {

    var query = new Parse.Query('CrowdScore');
    var place = request.object.get('place');
    if(typeof place != "undefined") {
        query.equalTo('place', place)
        query.descending('createdAt');
        query.limit(1);
        query.find({
            success: function (results) {

                if (results.length > 0) {
                    response.success(results)
                } else {
                    response.error('Could not find CrowdScore for request: ' + request);
                }
            },
            error: function () {
                response.error('CrowdScore lookup failed with request: ' + request);
            }
        });
    } else {
        response.error('Place is required to retrieve crowd score and does not exist in: ' + request);
    }
});

Parse.Cloud.afterSave('UserCrowdScore', function (request) {

    var time = moment().subtract('hours', 2).toDate();

    console.log('In after save.');
    var userCrowdScore = Parse.Object.extend('UserCrowdScore');
    var query = new Parse.Query(userCrowdScore);
    var place = request.object.get('place');
    query.equalTo('place', place);
    query.greaterThanOrEqualTo('updatedAt', time);
    query.find({
        success: function (results) {
            if (results.length > 0) {

                var cs = Parse.Object.extend('CrowdScore');
                console.log('Updating crowd score for place: ' + place.id);
                cs.set('place', place);
                cs.set('crowded', calculateCrowdedScore(results));
                cs.set('parkingDifficult', calculateParkingDifficultScore(results));
                cs.set('coverCharge', calculateCoverChargeScore(results));
                cs.set('waitTime', calculateWaitTimeScore(results));
                cs.save();

            } else {
                console.error('No user crowd scores returned when querying for user crowd scores ' +
                    'after user save for request: ' + JSON.stringify(request));
            }
        },
        error: function () {
            console.error('Error updating crowd score after user save for request: ' + JSON.stringify(request))
        }
    });
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
    console.log('Crowded time: ' + crowdedTimeThreshold);

    var crowdedScores = _.filter(results, function (result) {
        var crowded = result.object.get('crowded');
        var updatedTime = result.object.get('updatedAt');
        return !!(typeof crowded != "undefined" && updatedTime >= crowdedTimeThreshold);

    });

    return calculateAverage(crowdedScores);
}

function calculateParkingDifficultScore(results) {

    var parkingScores = _.filter(results, function (result) {
        var parkingDifficult = result.object.get('parkingDifficult');
        return typeof parkingDifficult != "undefined";

    });

    return calculateAverage(parkingScores);
}

function calculateWaitTimeScore(results) {

    var waitTimeThreshold = moment().subtract('minutes', 15).toDate();
    console.log('Wait time: ' + waitTimeThreshold);

    var waitTimeScores = _.filter(results, function (result) {
        var waitTime = result.object.get('waitTime');
        var updatedTime = result.object.get('updatedAt');
        return !!(typeof waitTime != "undefined" && updatedTime >= waitTimeThreshold);
    });

    return calculateAverage(waitTimeScores);
}

function calculateCoverChargeScore(results) {

    var coverChargeTimeThreshold = moment().subtract('minutes', 60).toDate();
    console.log('Cover charge time: ' + coverChargeTimeThreshold);

    var waitTimeScores = _.filter(results, function (result) {
        var coverCharge = result.object.get('coverCharge');
        var updatedTime = result.object.get('updatedAt');
        return !!(typeof coverCharge != "undefined" && updatedTime >= coverChargeTimeThreshold);
    });

    return calculateAverage(waitTimeScores);
}