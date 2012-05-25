var fs = require('fs');
var exec = require('child_process').exec;

var LocalDriver = function(jobDescription) {
    this.jobDescription = jobDescription;
};

LocalDriver.prototype.execute = function(cb) {
    this.jobDescription.generate(function(err,job){
	if(err) {
	    cb(err, "Error generating map reduce scripts");
	} else {
	    var command = "cd "+job.jobWorkingDirectory+" && mkdir ./.npmcfg && npm config set userconfig ./.npmcfg && npm config set cache . &&  npm install &> /dev/null && cat "+job.configuration.input+" | node "+job.mapperPath+" | node "+ __dirname+"/timothy/local_sorter.js | node "+job.reducerPath;
	    console.log("** executing test command:\n"+command);
	    exec(command, function(e, stdout, stderr) {

		console.log("\n\n*** OUTPUT:\n");
		console.log(stdout);
		console.log("*** ERROR:\n");
		console.log(stderr);
				
		exec("rm -rf "+job.jobWorkingDirectory, function(error, stdout, stderr) {
		    if (error !== null) {
			console.log('exec error: ' + error);
			cb(error, "error removing tmp directory "+job.jobWorkingDirectory+" : "+error);
		    } else {
			cb(e==null, (e==null ?"Error executing test command:\n"+command : null));
		    }
		});
	    });
	}
    });
};

var JobDescription = function() { };

/**
 * Validates description and throw meaningful errors
 */
JobDescription.prototype.validate = function(cb) {
    console.log("** validating");
    var notifications = {errors:[], warnings:[]};
    if(this.configuration.mapper == null)
	notifications.errors.push("ERROR: No mapper function has been assigned");

    if(this.configuration.hadoopHome == null)
	notifications.errors.push("ERROR: HADOOP_HOME not set");

    if(this.configuration.input == null)
	notifications.errors.push("ERROR: input not set");

    if(this.configuration.output == null)
	notifications.errors.push("ERROR: output not set");

    // add more errors and warnings

    if(notifications.errors.length > 0) {
	console.log("* validation ok");
	cb(false, notifications)
    } else {
	console.log("* validation fail");
	cb(true)
    }
};

JobDescription.prototype.generatePackageDotJSON = function(cb) {
    var pkg = {name: this.configuration.name.replace(/ /g,"_").toLowerCase(),
	       version: "1.0.0",
	       dependencies: this.dependencies,
	       engine: "node >=0.6.0"}

    this.packageJSONPath = this.jobWorkingDirectory+"/package.json";

    fs.writeFile(this.packageJSONPath, JSON.stringify(pkg), function (err) {
	if (err !== null) {
	    console.log('error writing package.json : ' + err);
	    cb(err);
	} else {
	    cb(false);
	}
    });
};

JobDescription.prototype.generateShellScripts = function(cb) {
    var that = this;
    //var mapperCommand = "#!/usr/bin/env bash\nmkdir ./.npmcfg \n npm config set userconfig ./.npmcfg \n npm config set cache . \n  npm install &> /dev/null \n node ./mapper.js";
    var mapperCommand = "#!/usr/bin/env bash\n node -e \"var exec=require('child_process').exec; exec('readlink ./mapper.js', function(err, stdout, sterr){ var dir = stdout.split('mapper.js')[0]; exec('cd '+dir+' && mkdir ./.npmcfg && npm config set userconfig ./.npmcfg && npm config set cache . &&  npm install &> /dev/null', function(){}) })\" && ./mapper.js";
    //var mapperCommand = "#!/usr/bin/env bash\nmkdir ./.npmcfg && mkdir ./.npmcache && npm --userconfig ./.npmcfg --cache ./.npmcache install && node ./mapper.js";
    fs.writeFile(this.mapperShellScriptPath, mapperCommand, function (err) {
	if (err !== null) {
	    console.log('error writing package.json : ' + err);
	    cb(err);
	} else {
	    //var reducerCommand = "#!/usr/bin/env bash\nmkdir ./.npmcfg \n npm config set userconfig ./.npmcfg \n npm config set cache . \n  npm install &> /dev/null \n node ./reducer.js";	    
	    var reducerCommand = "#!/usr/bin/env bash\n node -e \"var exec=require('child_process').exec; exec('readlink ./reducer.js', function(err, stdout, sterr){ var dir = stdout.split('reducer.js')[0]; exec('cd '+dir+' && mkdir ./.npmcfg && npm config set userconfig ./.npmcfg && npm config set cache . &&  npm install &> /dev/null', function(){}) })\" && ./reducer.js";
	    fs.writeFile(that.reducerShellScriptPath, reducerCommand, function (err) {
		if (err !== null) {
		    console.log('error writing package.json : ' + err);
		    cb(err);
		} else {
		    cb(false);
		}
	    });
	}
    });
};

/**
 * Generates map/reduce scripts and package them
 */
JobDescription.prototype.generate = function(cb) {
    this.jobWorkingDirectory = "/tmp/timothy/"+this.configuration.name.replace(/ /g, "_").toLowerCase()+"_"+(new Date().getTime())+"_"+(Math.floor(Math.random() * 100000));
    this.mapperPath = this.jobWorkingDirectory+"/mapper.js";
    this.reducerPath = this.jobWorkingDirectory+"/reducer.js";
    this.mapperShellScriptPath = this.jobWorkingDirectory+"/mapper.sh";
    this.reducerShellScriptPath = this.jobWorkingDirectory+"/reducer.sh";
    console.log("Generated files in: "+this.jobWorkingDirectory);
    
    var that = this;
    exec("mkdir -p "+this.jobWorkingDirectory, 
	 function (error, stdout, stderr) {
	     if (error !== null) {
		 console.log('exec error: ' + error);
	     } else {
		 fs.readFile(__dirname+"/timothy/mapper_template.js", function (err, data) {
		     data = data.toString().replace("//@MAPPER_HERE", "var map="+that.mapper+";");

		     if(that.setupFn != null)
			 data = data.replace("//@LOCALS_HERE","var _that=this;("+that.setupFn.toString().replace(/global/g,"_that")+")();");

		     fs.writeFile(that.mapperPath, data, function (err) {

			 fs.readFile(__dirname+"/timothy/reducer_template.js", function (err, data) {
			     data = data.toString().replace("//@REDUCER_HERE", "var reduce="+that.reducer+";");

			     if(that.setupFn != null)
				 data = data.replace("//@LOCALS_HERE","var _that=this; ("+that.setupFn.toString().replace(/global/g,"_that")+")();");

			     fs.writeFile(that.reducerPath, data, function (err) {
				 that.generatePackageDotJSON(function(error){
				     if(error) {
					 cb(error, that);
				     } else {
					 that.generateShellScripts(function(error){
					     cb(error, that);
					 });
				     }
				 });
			     });
			 });

		     });	
		 });
	     }
	 });
};


JobDescription.prototype.execute = function(cb) {
    console.log("* executing");
    var command = this.configuration.hadoopHome+"/bin/hadoop jar "+this.configuration.hadoopHome+"/contrib/streaming/hadoop*streaming*.jar ";
    command += "-D mapred.job.name='"+this.configuration.name+"' ";
    command += "-files "+this.mapperPath+","+this.reducerPath+","+this.packageJSONPath+","+this.mapperShellScriptPath+","+this.reducerShellScriptPath+" ";
    if(this.configuration.config)
	command += "-conf '"+this.configuration.config+"' ";
    command += "-inputformat '"+this.configuration.inputFormat+"' ";
    command += "-outputformat '"+this.configuration.outputFormat+"' ";
    command += "-input "+this.configuration.input+" ";
    var mapperScript = this.mapperPath.split("/");
    mapperScript = mapperScript[mapperScript.length-1]
    command += "-mapper 'mapper.sh' ";
    //command += "-mapper 'node "+mapperScript+"' ";
    var reducerScript = this.reducerPath.split("/");
    reducerScript = reducerScript[reducerScript.length-1]
    command += "-reducer 'reducer.sh' ";
    //command += "-reducer 'node "+reducerScript+"' ";
    command += "-output "+this.configuration.output+" ";

    console.log("** executing Hadoop command:\n"+command);

    exec(command, function(e, stdout, stderr) {
	console.log("\n\n*** OUTPUT:\n");
	console.log(stdout);
	console.log("*** ERROR:\n");
	console.log(stderr);

	cb(e==null, (e==null ?"Error executing Hadoop command:\n"+command : null));
    });
};


var timothy = exports;

timothy.currentJob = null;

timothy.configure = function(options) {
    if(this.currentJob === null)
	this.currentJob = new JobDescription();

    this.currentJob.configuration = options;
    this.currentJob.configuration.inputFormat = "org.apache.hadoop.mapred.TextInputFormat"
    this.currentJob.configuration.outputFormat = "org.apache.hadoop.mapred.TextOutputFormat"
    if(this.currentJob.configuration.name == null)
	this.currentJob.configuration.name = "Timothy's MapReduce Job"
    if(this.currentJob.configuration.hadoopHome == null)
	this.currentJob.configuration.hadoopHome = process.env.HADOOP_HOME;
    return this;
};

timothy.define = function(defFn) {
    if(this.currentJob === null)
	this.currentJob = new JobDescription();

    var vars={}, fns={};

    defFn(vars,fns);

    this.currentJob.definitions = {vars: vars, fns: fns};

    return this;
};

timothy.setup = function(setupFn) {
    if(this.currentJob === null)
	this.currentJob = new JobDescription();

    this.currentJob.setupFn = setupFn;
    return this;
};

timothy.dependencies = function(dependenciesHash) {
    if(this.currentJob === null)
	this.currentJob = new JobDescription();

    this.currentJob.dependencies = dependenciesHash;
    return this;
};

timothy.map = function(mapFn) {
    if(this.currentJob === null)
	this.currentJob = new JobDescription();
    
    this.currentJob.mapper = mapFn.toString();
    return this;
};

timothy.reduce = function(reduceFn) {
    if(this.currentJob === null)
	this.currentJob = new JobDescription();

    this.currentJob.reducer = reduceFn.toString();
    return this;
};

timothy.run = function(cb) {
    var that = this;
    cb = (cb == null ? function(){} : cb);

    this.currentJob.validate(function(err, msg){
	
	if(err) {
	    cb(err, msg);
	} else {
	    that.currentJob.generate(function(err, job){
		if(err) {
		    cb(err, job);
		} else {
		    job.execute(function(e,msg) {
			if(e) {
			    cb(true);
			} else {
			    exec("rm -rf "+that.currentJob.jobWorkingDirectory, function(error, stdout, stderr) {

				if (error !== null) {
				    console.log('exec error: ' + error);
				    cb(error, "error removing tmp directory "+that.currentJob.jobWorkingDirectory+" : "+error);
				} else {
				    // ready to process another job
				    that.currentJob = null;
				    // normal return
				    cb(false);
				}
			    });
			}
		    });
		}
	    });
	}
    });
};

timothy.runLocal = function(inputPath, cb) {
    cb = (cb==null ? function(){} : cb);

    if(inputPath == null)
	throw new Exception("A local input path must be provided");
    else
	this.currentJob.configuration.input = inputPath;
	
    var driver = new LocalDriver(this.currentJob);
    driver.execute(cb);
};