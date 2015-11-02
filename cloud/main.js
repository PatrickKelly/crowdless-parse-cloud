var moment = require('moment');
var _ = require('underscore');

Parse.Cloud.define("hello", function (request, response) {
    response.success("Hello world!");
});

Parse.Cloud.define("getCrowdScore", function (request, response) {

    var query = new Parse.Query("CrowdScore");
    query.get(request.params.placeId, {
        success: function (results) {

            if (results.length > 0) {
                response.success(results)
            } else {
                response.error("Could not find CrowdScore for request:: " + request);
            }
        },
        error: function () {
            response.error("CrowdScore lookup failed with request: " + request);
        }
    });
});

Parse.Cloud.afterSave("UserCrowdScore", function (request) {
    var cs = Parse.Object.extend("CrowdScore");
    query = new Parse.Query(cs);
    query.equalTo("place", request.object.get("place"));
    query.find({
        success: function(results) {
            if (results.length > 0) {
                var crowdScore = results[0];
                crowdScore.set("coverCharge", request.object.get("coverCharge"));
                crowdScore.set("packed", request.object.get("packed"))
                crowdScore.set("parkingDifficult", request.object.get("parkingDifficult"))
                crowdScore.set("waitTime", request.object.get("waitTime"))
                crowdScore.set("currentScore", 2)
                crowdScore.save();

            } else {
                var GameScore = Parse.Object.extend("CrowdScore");
                crowdScore = new GameScore();

                crowdScore.set("coverCharge", request.object.get("coverCharge"));
                crowdScore.set("packed", request.object.get("packed"))
                crowdScore.set("parkingDifficult", request.object.get("parkingDifficult"))
                crowdScore.set("waitTime", request.object.get("waitTime"))
                crowdScore.set("currentScore", 2)
                crowdScore.set("place", request.object.get("place"))
                crowdScore.save();
            }
        },
        error: function(error) {
            alert("Error: " + error.code + " " + error.message);
        }
    });
});



