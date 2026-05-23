const PROXY = 'https://learn.reboot01.com/api/graphql-engine/v1/graphql';

async function gqlQuery(query, variables) {
  var jwt = localStorage.getItem('jwt');
  if (!jwt) { window.location.href = '/'; return; }

  var res = await fetch(PROXY, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + jwt
    },
    body: JSON.stringify({ query: query, variables: variables || {} })
  });

  if (res.status === 401) {
    localStorage.removeItem('jwt');
    window.location.href = '/';
    return;
  }

  var json = await res.json();
  if (json.errors && json.errors.length) {
    throw new Error(json.errors.map(function(e) { return e.message; }).join('\n'));
  }
  return json.data;
}

var DETAILED_PROFILE_QUERY =
  'query profile {' +
  '  user {' +
  '    id' +
  '    login' +
  '    totalUp' +
  '    totalDown' +
  '    level: transactions(' +
  '      limit: 1' +
  '      order_by: { createdAt: desc }' +
  '      where: { type: { _eq: "level" } }' +
  '    ) {' +
  '      amount' +
  '    }' +
  '    transactions(' +
  '      order_by: { createdAt: asc }' +
  '      where: { type: { _eq: "xp" } }' +
  '    ) {' +
  '      type' +
  '      amount' +
  '      createdAt' +
  '      path' +
  '    }' +
  '    skills: transactions(' +
  '      where: { type: { _like: "skill_%" } }' +
  '    ) {' +
  '      type' +
  '      amount' +
  '    }' +
  '  }' +
  '  projects: progress(' +
  '    where: {' +
  '      object: { type: { _eq: "project" } }' +
  '    }' +
  '    order_by: { updatedAt: desc }' +
  '  ) {' +
  '    path' +
  '    grade' +
  '    isDone' +
  '    object {' +
  '      name' +
  '      type' +
  '    }' +
  '  }' +
  '}';

async function fetchAllData() {
  return await gqlQuery(DETAILED_PROFILE_QUERY);
}