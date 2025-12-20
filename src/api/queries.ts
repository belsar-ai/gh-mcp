/**
 * GitHub GraphQL Queries and Mutations
 */

export const GET_VIEWER = `
  query {
    viewer {
      login
    }
  }
`;

export const GET_ISSUES = `
  query GetIssues($owner: String!, $repo: String!, $first: Int = 20, $states: [IssueState!]) {
    repository(owner: $owner, name: $repo) {
      issues(first: $first, states: $states, orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes {
          id
          number
          title
          url
          state
          body
          milestone {
            title
          }
          labels(first: 10) {
            nodes {
              name
            }
          }
          subIssues(first: 20) {
            nodes {
              id
              number
              title
              state
            }
          }
        }
      }
    }
  }
`;

export const GET_ISSUE = `
  query GetIssue($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $number) {
        id
        number
        title
        url
        state
        body
        milestone {
          title
        }
        labels(first: 10) {
          nodes {
            name
          }
        }
        subIssues(first: 20) {
          nodes {
            id
            number
            title
            state
          }
        }
      }
    }
  }
`;

export const GET_ISSUE_ID = `
  query GetIssueID($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $number) {
        id
      }
    }
  }
`;

export const GET_CONTEXT_IDS = `
  query GetContextIDs($owner: String!, $repo: String!, $projectNumber: Int!, $withProject: Boolean!) {
    repository(owner: $owner, name: $repo) {
      id
      labels(first: 100) {
        nodes {
          id
          name
        }
      }
      milestones(first: 20, states: OPEN) {
        nodes {
          id
          title
          number
          description
        }
      }
      issueTypes(first: 20) {
        nodes {
          id
          name
        }
      }
      owner @include(if: $withProject) {
        ... on Organization {
          projectV2(number: $projectNumber) {
            id
          }
        }
        ... on User {
          projectV2(number: $projectNumber) {
            id
          }
        }
      }
    }
  }
`;

export const LIST_PROJECTS_ORG = `
  query ListProjectsOrg($owner: String!, $after: String) {
    organization(login: $owner) {
      projectsV2(first: 100, after: $after) {
        nodes {
          id
          number
          title
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

export const LIST_PROJECTS_USER = `
  query ListProjectsUser($owner: String!, $after: String) {
    user(login: $owner) {
      projectsV2(first: 100, after: $after) {
        nodes {
          id
          number
          title
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

export const SEARCH_ISSUES = `
  query SearchIssues($query: String!) {
    search(query: $query, type: ISSUE, first: 100) {
      nodes {
        ... on Issue {
          id
          number
          title
          url
          state
          body
          milestone {
            title
          }
          labels(first: 10) {
            nodes {
              name
            }
          }
          subIssues(first: 20) {
            nodes {
              id
              number
              title
              state
            }
          }
        }
      }
    }
  }
`;

export const CREATE_ISSUE = `
  mutation CreateIssue($repoId: ID!, $title: String!, $body: String!, $labelIds: [ID!], $milestoneId: ID, $issueTypeId: ID, $parentIssueId: ID) {
    createIssue(input: {repositoryId: $repoId, title: $title, body: $body, labelIds: $labelIds, milestoneId: $milestoneId, issueTypeId: $issueTypeId, parentIssueId: $parentIssueId}) {
      issue {
        id
        number
        url
        title
      }
    }
  }
`;

export const UPDATE_ISSUE = `
  mutation UpdateIssue($issueId: ID!, $title: String, $body: String, $state: IssueState) {
    updateIssue(input: {id: $issueId, title: $title, body: $body, state: $state}) {
      issue {
        id
        number
        url
        title
      }
    }
  }
`;

export const DELETE_ISSUE = `
  mutation DeleteIssue($issueId: ID!) {
    deleteIssue(input: {issueId: $issueId}) {
      repository {
        name
      }
    }
  }
`;

export const ADD_TO_PROJECT = `
  mutation AddToProject($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
      item {
        id
      }
    }
  }
`;

export const ADD_LABELS_TO_ISSUE = `
  mutation AddLabelsToIssue($issueId: ID!, $labelIds: [ID!]!) {
    addLabelsToLabelable(input: {labelableId: $issueId, labelIds: $labelIds}) {
      labelable {
        ... on Issue {
          id
        }
      }
    }
  }
`;

export const REMOVE_LABELS_FROM_ISSUE = `
  mutation RemoveLabelsFromIssue($issueId: ID!, $labelIds: [ID!]!) {
    removeLabelsFromLabelable(input: {labelableId: $issueId, labelIds: $labelIds}) {
      labelable {
        ... on Issue {
          id
        }
      }
    }
  }
`;
