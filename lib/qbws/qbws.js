/**
 * Original by: https://github.com/johnballantyne/qbws
 *
 * Debugged by Dillon Bostwick and modified to retrieve XML from Saguaro database
 *
 * Notes:
 *  - QuickBooks wants an empty string passed for "company file" if indicating use
 * of the currently open QBW file, but it wants a C-style empty string. So in JavaScript
 * pass \0 for this
 */

var http = require('http');
var soap = require('soap');
var chalk = require('chalk');
var fs = require('fs');
var builder = require('xmlbuilder');
var uuid = require('node-uuid');
var express = require('express');

var globals = require('../globals');

var qbws,
    server,
    counter = null,
    connectionErrCounter = null,
    username = globals.qbwcUsername,
    password = globals.qbwcPassword,
    companyFile = globals.qbwcCompanyFile,
    log = '',
    req = [];

/**
 * Returns an array of sample QBXML requests
 * @returns {String|Array} QBXML requests: CustomerQuery, InvoiceQuery and BillQuery
 */
function buildRequest() {
    var inputXML;
    var request = [];

    // CustomerQuery
    inputXML = builder.create('QBXML', { version: '1.0' })
                .instruction('qbxml', 'version="13.0"')
                .ele('QBXMLMsgsRq', { 'onError': 'continueOnError' })
                      .ele('CustomerQueryRq', { 'requestID': '0' })
                          .ele('MaxReturned')
                              .text('1')
                .end();

    request.push(inputXML);

    // IBillAdd

    request.push(require('../utils/billToQbXmlTest')); // RIGHT HERE

    for (var i = 0; i < request.length; i++) {
        console.log('\n-----\n\nRequest #' + i + ': ' + request[i] + '\n-----\n\n');
    }

    return request;
}

/**
 * Parses the first two version components out of the standard four component
 * version number: `<Major>.<Minor>.<Release>.<Build>`
 * @example
 * // returns 2.0
 * parseForVersion("2.0.1.30");
 * @param input {String} A version number
 * @returns {String} First two version components (i.e. <Major>.<Minor>)
 * or the original input parameter if it does not match the regular expression
 */
function parseForVersion(input) {
    // As long as you get the version in right format, you could use
    // any algorithm here.
    var major = '',
        minor = '',
        version = /^(\d+)\.(\d+)(\.\w+){0,2}$/,
        versionMatch;

    versionMatch = version.exec(input.toString());

    if (versionMatch !== null) {
        major = versionMatch[1];
        minor = versionMatch[2];

        return major + '.' + minor;
    } else {
        return input;
    }
}

/**
 * Writes a string to the console and log file
 * @param input {String} String to be logged
 */
function serviceLog(data) {
    console.log(data);
    log += data + "\n";
}

/**
 * Logs qbws method calls and their parameters
 * @param name {String} The name of the method
 * @param params {Object} The parameters sent with the method's function call
 */
function announceMethod(name, params) {
    var arg,
        argType;

    serviceLog('WebMethod: ' + name +
                '() has been called by QBWebConnector');

    // TODO: dedicated method for Object...length
//     if (Object.getOwnPropertyNames(params).length) {
//         serviceLog('    Parameters received:');
//         for (arg in params) {
//             if (params.hasOwnProperty(arg)) {
//                 // TODO: Truncate long value
//                 argType = typeof params[arg];
//                 // TODO: DRY this up
//                 if (argType === 'object') {
//                     serviceLog('        ' + argType + ' ' + arg + ' = ' +
//                                JSON.stringify(params[arg], null, 2));
//                 } else {
//                     serviceLog('        ' + argType + ' ' + arg + ' = ' +
//                                params[arg]);
//                 }
//             }
//         }
//     } else {
//         serviceLog('    No parameters received.');
//     }
}

qbws = {
    QBWebConnectorSvc: {
        QBWebConnectorSvcSoap: {}
    }
};


/**
 * To enable web service with its version number returned back to QBWC
 * @returns {String} qbws's version number
 */
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.serverVersion =
function (args) {
    var retVal = '0.2.1';

    announceMethod('serverVersion', args);
    serviceLog('    No parameters required.');
    serviceLog('    Returned: ' + retVal);

    return {
        serverVersionResult: { string: retVal }
    };
};

/**
 * @function clientVersion
 * @summary An optional callback that allows the web service to evaluate the
 * current web connector version and react to it.
 *
 * @description An optional callback that allows the web service to evaluate
 * the current web connector version and react to it. Not currently required to
 * support backward compatibility but strongly recommended.
 *
 * Supply one of the following return strings:
 *
 *  - "NULL" or "" (empty string) if you want the Web
 *    Connector to proceed with the update
 *  - "W:<any text>" if you want the web Connector to display
 *    a WARNING dialog prompting the user to continue with the
 *    update or cancel it. The text string after the "W:" will
 *    be displayed in the warning dialog.
 *  - "E:<any text>" if you want to cancel the update and
 *    display an ERROR dialog. The text string after "E:" will
 *    be displayed in the error dialog. The user will have to
 *    download a new version of the Web Connector to continue
 *    with the update.
 *  - "O:<version number>" to tell the user that the server
 *    expects a newer version of QBWC than the user currently
 *    has but also tells the user which version is needed
 * @param strVersion {String} The version of the QB web connector supplied in the
 *                                web connector's call to clientVersion
 * @returns {String} A string telling the Web Connector what to do next.
 *
 */
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.clientVersion =
function (args) {
    announceMethod('clientVersion', args);

    var strVersion = args.strVersion,
        recommendedVersion = '2.0.1.30',
        supportedMinVersion = '1.0',
        suppliedVersion,
        retVal = '';

    suppliedVersion = parseForVersion(strVersion);

    serviceLog('    QBWebConnector Version = ' + strVersion);
    serviceLog('    Recommended Version = ' + recommendedVersion);
    serviceLog('    Supported Minimum Version = ' + supportedMinVersion);
    serviceLog('    Supplied Version = ' + suppliedVersion);

    if (strVersion < recommendedVersion) {
        retVal = 'W:We recommend that you upgrade your QBWebConnector';
    } else if (strVersion < supportedMinVersion) {
        retVal = 'E:You need to upgrade your QBWebConnector';
    }

    serviceLog('    Return values:');
    serviceLog('        string retVal = ' + retVal);

    return {
        clientVersionResult: { string: retVal }
    };
};

// WebMethod - authenticate()
// To verify username and password for the web connector that is trying to connect
//
// IN:
// string strUserName
// string strPassword
//
// OUT:
// string[] authReturn
// Possible values:
// string[0] = ticket
// string[1]
// - empty string = use current company file
// - "none" = no further request/no further action required
// - "nvu" = not valid user
// - any other string value = use this company file
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.authenticate =
function (args) {
    var authReturn = [];

    announceMethod('authenticate', args);

    // Code below uses a random GUID to use as a session ticket
    // An example of a GUID is {85B41BEE-5CD9-427a-A61B-83964F1EB426}
    authReturn[0] = uuid.v1();

    // For simplicity of sample, a hardcoded username/password is used.
    // In real world, you should handle authentication in using a standard way.
    // For example, you could validate the username/password against an LDAP
    // or a directory server
    // TODO: This shouldn't be hard coded
    serviceLog('    Password locally stored = ' + password);

    if (args.strUserName.trim() === username && args.strPassword.trim() === password) {
        req = buildRequest();
        serviceLog('req is built: ');
        serviceLog(req);

        if (req.length === 0) {
            authReturn[1] = 'NONE'; //IMPORTANT: If the request is empty, just CLOSE the connection now.
            //This is useful when redoing buildRequest, so that it only goes through when there are bills to pay
        } else {
            // An empty string for authReturn[1] means asking QBWebConnector
            // to connect to the company file that is currently opened in QB
            authReturn[1] = companyFile;
        }
    } else {
        authReturn[1] = 'nvu';
    }

    serviceLog('    Return values: ');
    serviceLog('        string[] authReturn[0] = ' + authReturn[0]);
    serviceLog('        string[] authReturn[1] = ' + authReturn[1]);

    //TODO: this should just be the first two elements -- drop the 0 and the 60. This doesn't need to be done until later, and ideally it should be tested after the change
    return {
        authenticateResult: { string: [authReturn[0], authReturn[1], 0, 60] }
    };
};

// WebMethod - sendRequestXML()
// Description: This web method facilitates web service to send request XML to QuickBooks via QBWebConnector
//
// IN:
// int qbXMLMajorVers
// int qbXMLMinorVers
// string ticket
// string strHCPResponse
// string strCompanyFileName
// string Country
// int qbXMLMajorVers
// int qbXMLMinorVers
//
// OUT:
// string request
// Possible values:
// - any_string = Request XML for QBWebConnector to process
// - "" = No more request XML
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.sendRequestXML =
function (args) {
    var total,
        request = '';

    if (counter === null) {
        counter = 0;
    }

    announceMethod('sendRequestXML', args);

    total = req.length;

    if (counter < total) {
        request = req[counter];


        serviceLog('\n\n\n---------- Sending request no = ' + (counter) + ' ----------\n\n\n');


        counter = counter + 1;
    } else {
        counter = 0;
        request = '';
    }

    console.log("sending request: ", request);

    return {
        sendRequestXMLResult: { string: request }
    };
};

// WebMethod - closeConnection()
// At the end of a successful update session, QBWebConnector will call this web method.
//
// IN:
// string ticket
//
// OUT:
// string closeConnection result
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.closeConnection =
function (args) {
    var retVal = null;

    announceMethod('closeConnection', args);

    retVal = 'OK';

    serviceLog('    Return values:');
    serviceLog('        string retVal = ' + retVal);

    return {
        closeConnectionResult: { string: retVal }
    };
};

// WebMethod - connectionError()
// To facilitate capturing of QuickBooks error and notifying it to web services
// Description: This web method facilitates web service to handle connection error between QuickBooks and QBWebConnector
//
// IN:
// string ticket = A GUID based ticket string to maintain identity of QBWebConnector
// string hresult = An HRESULT value thrown by QuickBooks when trying to make connection
// string message = An error message corresponding to the HRESULT
//
// OUT:
// string retVal
// Possible values:
// - done = no further action required from QBWebConnector
// - any other string value = use this name for company file
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.connectionError =
function (args) {
    var hresult = args.hresult,
        message = args.message,
        retVal = null,
    // 0x80040400 - QuickBooks found an error when parsing the
    //     provided XML text stream.
        QB_ERROR_WHEN_PARSING = '0x80040400',
    // 0x80040401 - Could not access QuickBooks.
        QB_COULDNT_ACCESS_QB = '0x80040401',
    // 0x80040402 - Unexpected error. Check the qbsdklog.txt file for
    //     possible additional information.
        QB_UNEXPECTED_ERROR = '0x80040402';
    // Add more as you need...

    if (connectionErrCounter === null) {
        connectionErrCounter = 0;
    }

    announceMethod('connectionError', args);

    // TODO: Why is the same code repeated thrice? Switch statement instead?
    // REFACTOR THIS SO BADLY - Dillon

    if (hresult.trim() === QB_ERROR_WHEN_PARSING) {
        serviceLog('    HRESULT = ' + hresult);
        serviceLog('    Message = ' + message);
        retVal = 'DONE';
    } else if (hresult.trim() === QB_COULDNT_ACCESS_QB) {
        serviceLog('    HRESULT = ' + hresult);
        serviceLog('    Message = ' + message);
        retVal = 'DONE';
    } else if (hresult.trim() === QB_UNEXPECTED_ERROR) {
        serviceLog('    HRESULT = ' + hresult);
        serviceLog('    Message = ' + message);
        retVal = 'DONE';
    } else {
        // Depending on various hresults return different value
        if (connectionErrCounter === 0) {
            // Try again with this company file
            serviceLog('    HRESULT = ' + hresult);
            serviceLog('    Message = ' + message);
            serviceLog('    Sending empty company file to try again.');
            retVal = '';
        } else {
            serviceLog('    HRESULT = ' + hresult);
            serviceLog('    Message = ' + message);
            serviceLog('    Sending DONE to stop.');
            retVal = 'DONE';
        }
    }

    serviceLog('    Return values:');
    serviceLog('        string retVal = ' + retVal);
    connectionErrCounter = connectionErrCounter + 1;

    return {
        connectionErrorResult: { string: retVal }
    };

};

// WebMethod - getInteractiveURL()
//
// IN:
// string wcTicket
// string sessionID
//
// OUT:
// URL string
// Possible values:
// URL to a website
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.getInteractiveURL =
function (args) {
    var retVal = '';

    announceMethod('getInteractiveURL', args);

    return {
        getInteractiveURLResult: { string: retVal }
    };
};

// WebMethod - getLastError()
//
// IN:
// string ticket
//
// OUT:
// string retVal
// Possible Values:
// Error message describing last web service error
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.getLastError =
function (args) {
    var errorCode = 0,
        retVal = '';

    announceMethod('getLastError', args);

    if (errorCode === -101) {
        // This is just an example of custom user errors
        retVal = 'QuickBooks was not running!';
    } else {
        retVal = 'Error!';
    }

    serviceLog('    Return values:');
    serviceLog('        string retVal = ' + retVal);

    return {
        getLastErrorResult:  { string: retVal }
    };

};

// WebMethod - interactiveDone()
//
// IN:
// string wcTicket
//
// OUT:
// string
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.interactiveDone =
function (args) {
    var retVal = '';

    announceMethod('interactiveDone', args);

    return {
        interactiveDoneResult: { string: retVal }
    };
};

// WebMethod - interactiveRejected()
//
// IN:
// string wcTicket
// string reason
//
// OUT:
// string
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.interactiveRejected =
function (args) {
    var retVal = '';

    announceMethod('interactiveRejected', args);

    return {
        interactiveRejectedResult: { string: retVal }
    };
};

// WebMethod - receiveResponseXML()
// Description: This web method facilitates web service to receive response XML from QuickBooks via QBWebConnector
//
// IN:
// string ticket
// string response
// string hresult
// string message
//
// OUT:
// int retVal
// Greater than zero  = There are more request to send
// 100 = Done. no more request to send
// Less than zero  = Custom Error codes
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.receiveResponseXML =
function (args) {
    var response = args.response,
        hresult = args.hresult,
        message = args.message,
        retVal = 0,
        percentage;

    announceMethod('receiveResponseXML', args);

    // TODO: Create method for Object testing and property names length
    if (typeof hresult === 'object' && Object.getOwnPropertyNames(hresult).length !== 0) {
        // If there is an error with response received,
        //     web service could also return a -ve int
        serviceLog('    HRESULT = ' + hresult);
        serviceLog('    Message = ' + message);
        retVal = -101;
    } else {
        serviceLog('    Length of response received = ' + response.length);

        percentage = counter * 100 / req.length;
        if (percentage >= 100) {
            counter = 0;
        }

        // QVWC throws an error if if the return value contains a decimal
        retVal = percentage.toFixed();
    }

    console.log('\n\n\n----------RESPONSE---------- \n\n\n' + JSON.stringify(args, null, '\t') + '\n\n\n----------END RESPONSE----------\n\n\n');

    return {
        receiveResponseXMLResult: { string: retVal }
    };
};

module.exports.run = function runQBWS(server) {
    var soapServer,
        xml = fs.readFileSync(__dirname + '/qbws.wsdl', 'utf8');

    soapServer = soap.listen(server, '/wsdl', qbws, xml);
    server.listen(process.env.PORT || globals.localPort);

    serviceLog("SOAP server setup successful, running on /wsdl");

    soapServer.log = function soapServerLog(type, data) {
        serviceLog(type + ': ' + data);
    };
};

